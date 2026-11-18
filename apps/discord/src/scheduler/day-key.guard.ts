import { Injectable } from '@nestjs/common';
import { Infrastructure } from './infrastructure';

/** DI token: the interface below has no runtime value to inject by. */
export const DAY_KEY_GUARD = 'DAY_KEY_GUARD';

/**
 * How long a key lives. Three days is enough to cover a post that lands either side of
 * midnight in the guild's zone, and short enough that Redis holds nothing worth
 * thinking about.
 */
export const DAY_KEY_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * `recap:guildId:YYYY-MM-DD` — one key per guild per posted board.
 *
 * The date is the **slate day** (US/Eastern), the same key the games were grouped by,
 * so the key answers exactly one question: has this guild been sent the board for this
 * ET day? Keying it on the guild's local date instead would let a timezone change in
 * `/setup` post the same board twice.
 *
 * No durable twin: nothing proves a board was sent. A Redis flush therefore costs one
 * duplicate board — the next tick sees the day unposted and posts it again — which is
 * why the durable answer, when this earns its keep, is a `discord_guild_recaps` table
 * rather than a longer TTL.
 */
export function recapKey(guildId: string, etKey: string): string {
  return `recap:${guildId}:${etKey}`;
}

/**
 * `note:guildId:YYYY-MM-DD` — one key per guild per game-less day it has been told
 * about.
 *
 * Separate from `recapKey` because the two are about different days: the note is about
 * *today*, while the board it sits next to is for the last day that had games. Sharing
 * one key would let a quiet Monday suppress Tuesday's board, or the reverse.
 */
export function noteKey(guildId: string, etKey: string): string {
  return `note:${guildId}:${etKey}`;
}

/**
 * The "already posted today" check.
 *
 * This exists so a minute cron does not re-query the board 1,439 times a day for a
 * guild that has already had its post.
 */
export interface DayKeyGuard {
  has(key: string): Promise<boolean>;
  remember(key: string): Promise<void>;
}

@Injectable()
export class RedisDayKeyGuard implements DayKeyGuard {
  constructor(private readonly infra: Infrastructure) {}

  async has(key: string): Promise<boolean> {
    return (await this.infra.redis.exists(key)) === 1;
  }

  async remember(key: string): Promise<void> {
    await this.infra.redis.set(key, 'posted', 'EX', DAY_KEY_TTL_SECONDS);
  }
}
