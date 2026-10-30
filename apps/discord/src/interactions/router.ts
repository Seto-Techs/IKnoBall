import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import type { CommandData } from './handler.types';
import { interactionLog, trackAck, type InteractionOutcome } from '../ops/interaction-log';
import {
  BUTTON_HANDLERS,
  BUTTON_PREFIXES,
  commandHandlerClasses,
  COMMAND_HANDLERS,
} from './registry';

/**
 * Hands an interaction to the handler the registry names, and nothing more.
 *
 * The router's only real job is the 3-second acknowledgement deadline: it must
 * dispatch fast and never let one broken handler take the gateway down, so a
 * thrown error is logged and answered with an ephemeral failure instead of
 * bubbling into discord.js. Handlers are responsible for acknowledging; every
 * stub replies immediately rather than doing work first.
 *
 * It is also the one place every interaction passes through, which is why the
 * structured log line lives here (DISC-14) rather than in each handler: guild,
 * hashed user, custom id or command, outcome, and the two latencies. `ops/
 * interaction-log.ts` owns the fields and the hashing; this class only measures
 * and calls it once per interaction, including for the ones that fail.
 */
@Injectable()
export class InteractionRouter {
  private readonly logger = new Logger(InteractionRouter.name);
  /** Handler classes are providers; each is resolved once and then reused. */
  private readonly instances = new Map<unknown, unknown>();

  constructor(private readonly moduleRef: ModuleRef) {}

  /** Command definitions for the global registration on client ready. */
  commandDefinitions(): ReturnType<CommandData['toJSON']>[] {
    return commandHandlerClasses().map((Handler) => this.resolve(Handler).data.toJSON());
  }

  async handle(interaction: Interaction): Promise<void> {
    const startedAt = Date.now();
    const ack = trackAck(interaction);
    let outcome: InteractionOutcome = 'failed';

    try {
      outcome = await this.dispatch(interaction);
    } catch (error) {
      this.logger.error(
        `Interaction failed: ${describe(interaction)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (interaction.isRepliable()) {
        await this.replyEphemeral(
          interaction,
          'Something went wrong. Try again, or make the pick on the website.',
        );
      }
    } finally {
      ack.stop();
      // One line per interaction, always: ok, unknown, ignored, or failed. The
      // `ack` field is the deadline signal — `none` with a latency over 3000ms
      // means Discord already told the user "This interaction failed".
      this.logger.log(
        interactionLog(interaction, {
          outcome,
          latencyMs: Date.now() - startedAt,
          ackMs: ack.ackMs(),
        }),
      );
    }
  }

  /** Hand the interaction to its handler, and say which way it went. */
  private async dispatch(interaction: Interaction): Promise<InteractionOutcome> {
    if (interaction.isButton()) {
      return this.handleButton(interaction);
    }

    if (interaction.isChatInputCommand()) {
      return this.handleCommand(interaction);
    }

    this.logger.warn(`Ignoring interaction of unsupported type ${interaction.type}.`);
    return 'ignored';
  }

  private async handleButton(interaction: ButtonInteraction): Promise<InteractionOutcome> {
    const prefix = BUTTON_PREFIXES.find((candidate) => interaction.customId.startsWith(candidate));

    if (!prefix) {
      this.logger.warn(
        `Unknown button custom_id "${interaction.customId}" in guild ${interaction.guildId ?? 'dm'}.`,
      );
      await this.replyUnknown(interaction);
      return 'unknown';
    }

    const Handler = BUTTON_HANDLERS[prefix];
    if (!Handler) {
      this.logger.warn(
        `No handler registered for button prefix "${prefix}" (custom_id "${interaction.customId}").`,
      );
      await this.replyUnknown(interaction);
      return 'unknown';
    }

    await this.resolve(Handler).execute(interaction);
    return 'ok';
  }

  private async handleCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<InteractionOutcome> {
    const Handler = COMMAND_HANDLERS[interaction.commandName];
    if (!Handler) {
      this.logger.warn(`Unknown command "/${interaction.commandName}".`);
      await this.replyUnknown(interaction);
      return 'unknown';
    }

    await this.resolve(Handler).execute(interaction);
    return 'ok';
  }

  private async replyUnknown(interaction: RepliableInteraction): Promise<void> {
    await this.replyEphemeral(interaction, 'That is not an action I know how to do.');
  }

  /** Reply ephemerally whether or not the interaction was already acknowledged. */
  private async replyEphemeral(interaction: RepliableInteraction, content: string): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
      // The token expires after 15 minutes and the channel may be gone; there is
      // nothing left to tell the user, so only the log records it.
      this.logger.warn(
        `Could not send a fallback reply: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolve<T extends object>(Handler: new (...args: never[]) => T): T {
    const cached = this.instances.get(Handler);
    if (cached) return cached as T;

    const instance = this.moduleRef.get(Handler, { strict: false });
    this.instances.set(Handler, instance);
    return instance;
  }
}

function describe(interaction: Interaction): string {
  if (interaction.isButton()) {
    return `button "${interaction.customId}" in guild ${interaction.guildId ?? 'dm'}`;
  }
  if (interaction.isChatInputCommand()) {
    return `command "/${interaction.commandName}" in guild ${interaction.guildId ?? 'dm'}`;
  }
  return `type ${interaction.type}`;
}
