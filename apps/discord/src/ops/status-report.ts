import type { ModuleRef } from '@nestjs/core';
import type { Client } from 'discord.js';
import { and, count, eq, isNull, max } from 'drizzle-orm';
import { discordCards, discordGuilds } from '@iknoball/database';
import { DiscordConfigService } from '../config/discord-config.service';
import { DatabaseService } from '../infrastructure/database.service';
import { RateLimiter } from '../infrastructure/rate-limiter';

/**
 * The numbers behind `/status`, and where each one comes from.
 *
 * Every field is read live, per invocation. Nothing is cached and nothing is
 * estimated: an operator command that reports a stale number is worse than one
 * that reports none, because it is believed.
 *
 * | Field              | Source                                                     |
 * | ------------------ | ---------------------------------------------------------- |
 * | `enabled`          | `DiscordConfigService.enabled` (`DISCORD_ENABLED`)          |
 * | `guilds`           | the gateway client's `guilds.cache.size`                    |
 * | `guildsConfigured` | `discord_guilds`, enabled and not left                      |
 * | `lastPostAt`       | `max(discord_cards."createdAt")` — the newest card row       |
 * | `cards.*`          | `discord_cards` rows, counted by `lockedAt` / `settledAt`    |
 * | `queueDepth`       | `RateLimiter.depth()` (DISC-12)                              |
 *
 * Two notes on the sources, because both look like mistakes otherwise:
 *
 * - The brief names `discord_guild_configs`; the table is `discord_guilds`
 *   (`packages/database/src/schema.ts`). There is one row per server, keyed by
 *   `guildId`.
 * - "Last post" is a card's `createdAt`, which the scheduler writes *before* the
 *   message is sent (claim-then-send, so a crash cannot double-post). It is
 *   therefore the moment the bot decided to post, within one REST call of the
 *   actual send — the closest thing to a post timestamp the schema has.
 */
export interface StatusReport {
  enabled: boolean;
  /** Guilds the gateway is currently connected to; null while the client is not ready. */
  guilds: number | null;
  /** Rows in `discord_guilds` that are enabled and not marked as left. */
  guildsConfigured: number;
  /** Newest `discord_cards.createdAt`, or null when the bot has never posted. */
  lastPostAt: Date | null;
  cards: {
    /** Every card row: posted, locked, settled, or claimed but never sent. */
    posted: number;
    locked: number;
    settled: number;
  };
  /** Outbound Discord calls waiting in the rate limiter, or null when it has no `depth()`. */
  queueDepth: number | null;
}

/**
 * Read every number. Called from `/status`, which is rare, so the four reads run
 * in parallel and nothing is memoised.
 *
 * The database is `DatabaseService`, the same pool the rest of the bot uses, and
 * the client is resolved through `ModuleRef` — `AppModule` owns both and exports
 * neither, which is the pattern `scheduler/infrastructure.ts` established.
 */
export async function collectStatus(moduleRef: ModuleRef): Promise<StatusReport> {
  const config = moduleRef.get(DiscordConfigService, { strict: false });
  const db = moduleRef.get(DatabaseService, { strict: false }).db;
  const limiter = moduleRef.get(RateLimiter, { strict: false });

  const [client, guildRows, cardRows] = await Promise.all([
    discordClient(moduleRef),
    db
      .select({ configured: count() })
      .from(discordGuilds)
      .where(and(eq(discordGuilds.enabled, true), isNull(discordGuilds.leftAt))),
    db
      .select({
        posted: count(),
        // `count(column)` counts non-null values, which is exactly the two stamps.
        locked: count(discordCards.lockedAt),
        settled: count(discordCards.settledAt),
        lastPostAt: max(discordCards.createdAt),
      })
      .from(discordCards),
  ]);

  return {
    enabled: config.enabled,
    guilds: client ? client.guilds.cache.size : null,
    guildsConfigured: numberOf(guildRows[0]?.configured),
    lastPostAt: cardRows[0]?.lastPostAt ?? null,
    cards: {
      posted: numberOf(cardRows[0]?.posted),
      locked: numberOf(cardRows[0]?.locked),
      settled: numberOf(cardRows[0]?.settled),
    },
    queueDepth: queueDepth(limiter),
  };
}

/**
 * The report as Discord markdown, one line per fact.
 *
 * Discord renders `<t:…:R>` in the reader's own timezone and keeps it relative
 * ("2 hours ago"), which is what an operator actually wants from a timestamp, and
 * the absolute time is on the same line for when the relative one is not enough.
 */
export function formatStatus(report: StatusReport): string {
  const lines = [
    `**IKnoBall bot** · ${report.enabled ? 'active' : 'paused (`DISCORD_ENABLED=false`)'}`,
    `guilds: **${report.guilds ?? '—'}** connected · **${report.guildsConfigured}** configured`,
    `last slate post: ${lastPost(report.lastPostAt)}`,
    `cards: **${report.cards.posted}** posted · **${report.cards.locked}** locked · **${report.cards.settled}** settled`,
    `queue: ${
      report.queueDepth === null
        ? 'unknown (`RateLimiter.depth()` not available)'
        : `${report.queueDepth} waiting`
    }`,
  ];

  if (!report.enabled) {
    lines.push('_Posting, locks and settlement edits are off; pick clicks are refused._');
  }

  return lines.join('\n');
}

/**
 * The gateway client, loaded on demand.
 *
 * `DiscordClientService` imports `InteractionRouter`, which imports the command
 * registry, which imports this file — a cycle. Importing it as a value would hand
 * Nest `undefined` when it builds `StatusCommand`'s constructor metadata (the same
 * trap `setup/tokens.ts` documents for `/setup`), so the module is required at call
 * time, after the graph is complete. `/status` runs at most a few times a minute,
 * so the lookup is free.
 */
async function discordClient(moduleRef: ModuleRef): Promise<Client | null> {
  const { DiscordClientService } = await import('../infrastructure/discord-client.service');
  const client = moduleRef.get(DiscordClientService, { strict: false }).client;
  return client.isReady() ? client : null;
}

/**
 * `RateLimiter.depth()` is DISC-12 (chunk C10) and now exists; this calls it
 * directly. The `typeof` probe stays because `/status` is the command an operator
 * runs when something is wrong, so it must not be the command that throws when a
 * dependency is half-deployed. A missing method reports `null` ("unknown") rather
 * than crashing the report or inventing a zero, and a real zero still reads `0`.
 */
function queueDepth(limiter: RateLimiter): number | null {
  const probe = limiter as RateLimiter & { depth?: () => number };
  return typeof probe.depth === 'function' ? probe.depth() : null;
}

/** `count()` is typed as a number but pg hands back a bigint string. */
function numberOf(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lastPost(at: Date | null): string {
  if (!at) return 'never';
  const unix = Math.floor(at.getTime() / 1000);
  return `<t:${unix}:R> (<t:${unix}:f>)`;
}
