import { Injectable } from '@nestjs/common';
import { Infrastructure } from './infrastructure';

/** DI token: the interface below has no runtime value to inject by. */
export const DAY_KEY_GUARD = 'DAY_KEY_GUARD';

/**
 * How long a day key lives. Three days is enough to cover a post that lands either
 * side of midnight in the guild's zone, and short enough that Redis holds nothing
 * worth thinking about.
 */
export const DAY_KEY_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * `guildId:YYYY-MM-DD` — one key per guild per slate day.
 *
 * The date is the **slate day** (US/Eastern), the same key the games were
 * selected by, so the key answers exactly one question: has this guild been sent
 * the slate for this ET day? Keying it on the guild's local date instead would
 * let a timezone change in `/setup` post the same ET slate twice.
 */
export function dayKey(guildId: string, etKey: string): string {
  return `${guildId}:${etKey}`;
}

/**
 * `recap:guildId:YYYY-MM-DD` — one key per guild per recapped slate day.
 *
 * Prefixed so the two keyspaces cannot collide: a guild that recaps a day it was
 * never posted cannot block that day's slate, and the post key keeps its documented
 * shape.
 *
 * Unlike `dayKey`, this one has no durable twin — `discord_cards` proves a slate was
 * sent, nothing proves a recap was. A Redis flush therefore costs one duplicate
 * recap, which is why the durable answer when this earns its keep is a
 * `discord_guild_recaps` table rather than a longer TTL.
 */
export function recapKey(guildId: string, etKey: string): string {
  return `recap:${guildId}:${etKey}`;
}

/**
 * The "already posted today" check.
 *
 * Redis is the cheap guard; `discord_cards` is the durable one. This exists so a
 * minute cron does not re-query the slate 1,439 times a day for a guild that has
 * already had its post.
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
