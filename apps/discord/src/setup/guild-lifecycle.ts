import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Events, type Client } from 'discord.js';
import { GuildConfigService } from './guild-config.service';
import { Infrastructure } from '../scheduler/infrastructure';

/**
 * The one line a new installer gets, and the whole of the onboarding flow.
 *
 * A DM rather than a message in the server: the bot has no channel it is allowed
 * to choose, and DISC-09 is explicit that it must never guess one. The hint names
 * `/setup` and nothing else, because the command itself explains the options.
 */
export const SETUP_HINT =
  'Thanks for adding IKnoBall! Run `/setup channel:#nba` in your server to choose where the daily slate goes.';

/** The part of a guild this listener needs when the bot joins. */
export interface JoinedGuild {
  id: string;
  /** The owner is the closest thing Discord gives us to "the installer". */
  fetchOwner(): Promise<DmTarget>;
}

/** Anything that can receive a DM. `GuildMember` and `User` both fit. */
export interface DmTarget {
  send(payload: { content: string }): Promise<unknown>;
}

/** The part of a guild this listener needs when the bot is removed. */
export interface LeftGuild {
  id: string;
}

/**
 * `guildCreate` and `guildDelete`, which are about the *row*, not the guild.
 *
 * Two rules (DISC-09):
 *
 * - **A removal is not a deletion.** `guildDelete` stamps `leftAt`; the row keeps
 *   the channel, hour, and zone, so re-adding the bot restores the config instead
 *   of making the admin run `/setup` again.
 * - **A join is not a configuration.** `guildCreate` clears `leftAt` and sends one
 *   DM; it never writes a channel, because a guessed channel would post a slate
 *   somewhere nobody asked for.
 *
 * Neither handler may reject into discord.js, so every failure is logged and
 * swallowed: a closed DM is the normal case for a bot, and a database hiccup on
 * one guild must not take the gateway down.
 */
@Injectable()
export class GuildLifecycle implements OnApplicationBootstrap {
  private readonly logger = new Logger(GuildLifecycle.name);

  constructor(
    private readonly infra: Infrastructure,
    private readonly config: GuildConfigService,
  ) {}

  /**
   * Bind the listeners once the application is up.
   *
   * `main.ts` logs in only after the context is ready, so the client exists (but
   * is not connected) here; listeners attached now catch the `guildCreate` events
   * Discord replays on the first `READY`, which is what a bot restart during an
   * install would otherwise miss.
   */
  onApplicationBootstrap(): void {
    this.register(this.infra.client);
  }

  /** Wire the two events. Separated from the hook so a test can drive a fake client. */
  register(client: Client): void {
    client.on(Events.GuildCreate, (guild) => {
      void this.onJoin(guild);
    });

    client.on(Events.GuildDelete, (guild) => {
      void this.onLeave(guild);
    });
  }

  /** The bot was added (or re-added): keep the old config, welcome the owner. */
  async onJoin(guild: JoinedGuild): Promise<void> {
    try {
      // A no-op for a first install: there is no row to clear `leftAt` on yet.
      await this.config.markRejoined(guild.id);
    } catch (error) {
      this.logger.error(
        `Could not clear leftAt for guild ${guild.id}: ${describe(error)}`,
        stackOf(error),
      );
    }

    await this.welcome(guild);
  }

  /** The bot was removed: record it, keep everything else. */
  async onLeave(guild: LeftGuild): Promise<void> {
    try {
      await this.config.markLeft(guild.id);
      this.logger.log(`Bot removed from guild ${guild.id}; config kept for a reinstall.`);
    } catch (error) {
      this.logger.error(
        `Could not record removal from guild ${guild.id}: ${describe(error)}`,
        stackOf(error),
      );
    }
  }

  /**
   * DM the owner the `/setup` hint.
   *
   * Discord does not say who added a bot, so the owner is the best available
   * recipient. Closed DMs are an ordinary outcome — Discord rejects with 50007 —
   * and so is an owner lookup that fails because the bot cannot see the guild yet;
   * both are logged at debug/warn level and neither is retried.
   */
  async welcome(guild: JoinedGuild): Promise<void> {
    let owner: DmTarget;
    try {
      owner = await guild.fetchOwner();
    } catch (error) {
      this.logger.warn(`Could not find the owner of guild ${guild.id}: ${describe(error)}`);
      return;
    }

    try {
      await owner.send({ content: SETUP_HINT });
    } catch (error) {
      this.logger.warn(
        `Could not DM the owner of guild ${guild.id} (DMs closed?): ${describe(error)}`,
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stackOf(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
