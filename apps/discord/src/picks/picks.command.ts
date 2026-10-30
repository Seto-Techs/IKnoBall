import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { PredictionMode } from '@iknoball/predictions';
import { ApiError, NotImplementedError } from '../api/errors';
import { IknoballClient } from '../api/iknoball.client';
import type { CommandHandler } from '../interactions/handler.types';
import { picksPayload, picksWebUrl } from './picks-payload';

/**
 * `/picks [mode]` — durable per-user pick history, ephemeral.
 *
 * Every confirmation the bot gives is ephemeral and vanishes (DISC-04), so this
 * is the only place a user can see what they actually chose. It reads
 * `GET /internal/picks`, the same rows the web's My Picks reads, so the two
 * surfaces cannot disagree.
 *
 * Nothing is persisted: the reply is rebuilt from the API on every call, which is
 * why there is no message to keep in sync and no edit cost.
 */
@Injectable()
export class PicksCommand implements CommandHandler {
  private readonly logger = new Logger(PicksCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('picks')
    .setDescription('Show your open and recently settled picks.')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Which scoring mode to show.')
        .addChoices({ name: 'flat', value: 'flat' }, { name: 'weighted', value: 'weighted' }),
    );

  constructor(private readonly client: IknoballClient) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Ack first and unconditionally: Discord gives an interaction 3 seconds, and
    // the ephemeral flag cannot be added later — not on a followup, not on an edit.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // `mode` is a display filter; the endpoint returns every mode for the user.
    const mode = parseMode(interaction.options.getString('mode'));

    try {
      const userId = await this.resolveUserId(interaction.user.id);
      if (!userId) {
        await interaction.editReply({ content: LINK_HINT });
        return;
      }

      const picks = await this.client.listPicks({ userId });
      await interaction.editReply(picksPayload(picks, { mode }));
    } catch (error) {
      await this.fail(interaction, error);
    }
  }

  /**
   * The Discord account's IKnoBall user, or null when it has never linked one.
   *
   * Throws `NotImplementedError` until C5 wires `resolveLink`; without a `userId`
   * there is no history to read, so that is answered like an unwired command.
   */
  private async resolveUserId(discordUserId: string): Promise<string | null> {
    const { userId } = await this.client.resolveLink({ discordUserId });
    return userId;
  }

  private async fail(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
    if (error instanceof NotImplementedError) {
      await interaction.editReply({
        content: `Pick history is not wired up yet. Your picks are on the web: ${picksWebUrl()}`,
      });
      return;
    }

    // Same rule as the pick button: 404/409 is "this account is not linked",
    // which is an action the user can take rather than an error.
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      await interaction.editReply({ content: LINK_HINT });
      return;
    }

    // Never the raw error: it can carry the API's internals and says nothing a
    // user can act on. The log keeps the detail.
    this.logger.error(
      `/picks failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );

    await interaction.editReply({
      content: `Could not load your picks. Try again in a moment, or see them on the web: ${picksWebUrl()}`,
    });
  }
}

/** The unlinked-account answer, worded as `pick.handler.ts` words it. */
const LINK_HINT =
  'Link your account first: run `/link` to connect this Discord account to IKnoBall, then pick again.';

/** The option's choices are exactly these two, so anything else is no filter. */
function parseMode(value: string | null): PredictionMode | null {
  return value === 'flat' || value === 'weighted' ? value : null;
}
