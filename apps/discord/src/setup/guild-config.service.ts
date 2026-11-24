import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { discordGuilds } from '@iknoball/database';
import { Infrastructure } from '../scheduler/infrastructure';

/**
 * One row of `discord_guilds`, which is the whole of a guild's board config.
 *
 * `postHour` and `timezone` are still columns, but nothing reads them: the board goes
 * out at one league-wide instant now (`recapDueAt`), so an admin cannot move it. They
 * are left in the table rather than dropped so this change needs no migration, and a
 * row written before the switch keeps whatever it had.
 */
export interface GuildSettings {
  guildId: string;
  channelId: string;
  enabled: boolean;
  installedAt: Date;
  /** Set when the bot was removed; the row survives so a reinstall keeps it. */
  leftAt: Date | null;
}

export interface SaveGuildSettings {
  guildId: string;
  channelId: string;
}

/**
 * Reads and writes `discord_guilds`.
 *
 * The table is the bot's memory of a server across restarts and across being
 * removed: `leftAt` is set on `guildDelete` and cleared on `guildCreate`, and the
 * row itself is never deleted, so re-adding the bot restores the channel the admin
 * chose (DISC-09).
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
   * `installedAt` is the first `/setup` and never moves; re-running the command with a
   * new channel must not make the guild look newly added.
   */
  async save(input: SaveGuildSettings): Promise<GuildSettings> {
    const existing = await this.get(input.guildId);

    const values = {
      guildId: input.guildId,
      channelId: input.channelId,
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
