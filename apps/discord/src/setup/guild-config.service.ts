import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { discordGuilds } from '@iknoball/database';
import { Infrastructure } from '../scheduler/infrastructure';
import { DEFAULT_POST_HOUR, DEFAULT_TIMEZONE } from './guild-settings';

/** One row of `discord_guilds`, which is the whole of a guild's slate config. */
export interface GuildSettings {
  guildId: string;
  channelId: string;
  /** Local hour, 0–23, in `timezone`. */
  postHour: number;
  timezone: string;
  enabled: boolean;
  installedAt: Date;
  /** Set when the bot was removed; the row survives so a reinstall keeps it. */
  leftAt: Date | null;
}

export interface SaveGuildSettings {
  guildId: string;
  channelId: string;
  postHour?: number | null;
  timezone?: string | null;
}

/**
 * Reads and writes `discord_guilds`.
 *
 * The table is the bot's memory of a server across restarts and across being
 * removed: `leftAt` is set on `guildDelete` and cleared on `guildCreate`, and the
 * row itself is never deleted, so re-adding the bot restores the channel and hour
 * the admin chose (DISC-09).
 */
@Injectable()
export class GuildConfigService {
  constructor(private readonly infra: Infrastructure) {}

  async get(guildId: string): Promise<GuildSettings | null> {
    const [row] = await this.infra.db
      .select()
      .from(discordGuilds)
      .where(eq(discordGuilds.guildId, guildId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Write the guild's config, keeping whatever the admin did not respecify.
   *
   * `/setup channel:#nba` alone must not reset the hour back to 9, so a missing
   * field falls back to the stored value and only then to the default.
   */
  async save(input: SaveGuildSettings): Promise<GuildSettings> {
    const existing = await this.get(input.guildId);

    const values = {
      guildId: input.guildId,
      channelId: input.channelId,
      postHour: input.postHour ?? existing?.postHour ?? DEFAULT_POST_HOUR,
      timezone: input.timezone ?? existing?.timezone ?? DEFAULT_TIMEZONE,
      enabled: true,
      installedAt: existing?.installedAt ?? new Date(),
      leftAt: null,
    };

    const [row] = await this.infra.db
      .insert(discordGuilds)
      .values(values)
      .onConflictDoUpdate({
        target: discordGuilds.guildId,
        set: {
          channelId: values.channelId,
          postHour: values.postHour,
          timezone: values.timezone,
          enabled: true,
          leftAt: null,
        },
      })
      .returning();

    return row;
  }

  /** `guildDelete`: keep the row, record that the bot is gone. */
  async markLeft(guildId: string): Promise<void> {
    await this.infra.db
      .update(discordGuilds)
      .set({ leftAt: new Date() })
      .where(and(eq(discordGuilds.guildId, guildId), isNull(discordGuilds.leftAt)));
  }

  /** `guildCreate` for a guild that has a row: it is back, config intact. */
  async markRejoined(guildId: string): Promise<void> {
    await this.infra.db
      .update(discordGuilds)
      .set({ leftAt: null })
      .where(eq(discordGuilds.guildId, guildId));
  }

  /**
   * Every guild the scheduler should consider.
   *
   * Disabled or left guilds are filtered in SQL rather than in the loop: the
   * minute cron runs this 1,440 times a day, and the list is the only thing it
   * needs from the table.
   */
  async listEnabled(): Promise<GuildSettings[]> {
    return this.infra.db
      .select()
      .from(discordGuilds)
      .where(and(eq(discordGuilds.enabled, true), isNull(discordGuilds.leftAt)))
      .orderBy(discordGuilds.guildId);
  }
}
