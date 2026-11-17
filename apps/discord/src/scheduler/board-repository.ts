/**
 * The database half of the daily board (0.6.0).
 *
 * Two questions, and nothing else: how the recent league days stand, and how many
 * picks settled on one of them for one guild. `board.ts` decides with the answers;
 * `BoardScheduler` asks every minute.
 *
 * Two queries per tick for the days, plus one per guild that is due — the days are
 * league-wide, so one answer covers every server.
 *
 * The slate-day expression lives in `schedule-days.ts`, because `DrizzleSlateStore`
 * asks the same question and the two answers must not drift.
 *
 * **`@Injectable()` is load-bearing.** Nest builds a provider from the class's
 * `design:paramtypes`, and TypeScript only emits that metadata for a decorated class.
 * Without the decorator the constructor is called with no arguments, `infra` is
 * `undefined`, and the failure surfaces only when a query runs — this class shipped
 * without it (as `RolloverRepository`) and every tick died on `this.infra.db` for the
 * life of the feature. `scheduler.module.spec.ts` guards the whole module against it.
 */
import { Injectable } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import {
  account,
  discordLinks,
  discordMembers,
  predictionPicks,
  scheduleGames,
  type Database,
} from '@iknoball/database';
import { STATUS_FINAL } from '../lock/card-edit';
import type { DayState } from './board';
import { Infrastructure } from './infrastructure';
import { slateDaySql } from './schedule-days';
import { etDateKey, shiftDateKey } from './slate-date';

/** How far back the per-day query looks; a board older than this is not worth posting. */
const DAY_WINDOW_DAYS = 7;

@Injectable()
export class BoardRepository {
  constructor(private readonly infra: Infrastructure) {}

  /**
   * Resolved on use, not on construction: `DatabaseService` is a provider of the root
   * module, which exports nothing, so this goes through `Infrastructure` the way every
   * other data-backed provider here does — including `DrizzleSlateStore`.
   */
  private get db(): Database {
    return this.infra.db;
  }

  /**
   * Every league day from a week ago onwards, so the caller can pick the last finished
   * one.
   *
   * Bounded backwards on purpose: the board is for the most recent night, and a day
   * that fell out of the window is a board nobody is waiting for. There is no upper
   * bound — the days ahead are in the answer and `latestFinishedDay` ignores them,
   * which is cheaper than a second query that has to agree with this one about what
   * "today" means.
   */
  async daysSince(now: Date = new Date()): Promise<DayState[]> {
    const from = shiftDateKey(etDateKey(now), -DAY_WINDOW_DAYS);

    const rows = await this.db
      .select({
        slateKey: slateDaySql,
        games: count(),
        finals: sql<number>`count(*) filter (where ${scheduleGames.gameStatus} = ${STATUS_FINAL})`,
        lastTipOff: sql<Date | string | null>`max(${scheduleGames.gameDateTimeUTC})`,
      })
      .from(scheduleGames)
      .where(sql`${slateDaySql} >= ${from}`)
      .groupBy(slateDaySql);

    return rows.map((row) => ({
      slateKey: row.slateKey,
      games: Number(row.games),
      finals: Number(row.finals),
      // `pg` hands a `timestamp` back as a `Date`, but the column carries no zone, so
      // it is normalised here rather than trusted.
      lastTipOff: row.lastTipOff === null ? null : new Date(row.lastTipOff),
    }));
  }

  /**
   * How many picks settled for a guild on one slate day.
   *
   * The board's gate: a day nobody picked is a day with nothing to show. Counted off
   * `prediction_picks` rather than any posted message, because the board ranks picks,
   * and a settled pick is what a row on it represents.
   *
   * **Membership, not provenance.** The board this gates is the one
   * `InternalLeaderboardService` renders, which ranks every settled pick by a user who
   * is in the guild *right now* — including picks made on the website or in the
   * Activity. So the count has to describe that same population, and it joins the same
   * Discord-identity bridge the board does.
   *
   * It used to filter `prediction_picks.guildId` instead, on the reading that the
   * column records where a pick was placed. Nothing writes it: the bot's pick path
   * sends `userId`, `gameId`, and `side` and no guild, so every day counted zero and
   * the board was skipped, silently, for the life of the feature. A column that is
   * null for every row makes a filter look correct and count nothing.
   */
  async settledPickCount(guildId: string, slateKey: string): Promise<number> {
    // `prediction_picks.gameId` is the feed's id, so the join is on
    // `scheduleGames.gameId`. On `id` this counts zero for every day.
    const members = this.guildMembers(guildId);

    const [row] = await this.db
      .select({ settled: count() })
      .from(predictionPicks)
      .innerJoin(scheduleGames, eq(scheduleGames.gameId, predictionPicks.gameId))
      .innerJoin(members, eq(members.userId, predictionPicks.userId))
      .where(and(eq(predictionPicks.status, 'settled'), sql`${slateDaySql} = ${slateKey}`));

    return Number(row?.settled ?? 0);
  }

  /**
   * The users who are in one guild right now, one row each.
   *
   * The same cut `InternalLeaderboardService.guildMembers` makes, and for the same
   * reasons: a Discord identity lives in `discord_links` only after `/link`, and in
   * Better Auth's `account` only after signing in with Discord, so a query that read
   * one table hid the other's users. The `group by` stops a user with two Discord
   * accounts in the same server from being counted twice.
   *
   * Duplicated from the API on purpose: the two live in different apps, the bot must
   * not depend on the API's internals, and the definition it encodes is the one the
   * board's own doc comment calls definition B. If that definition ever changes, both
   * copies change — the same bargain `schedule-days.ts` documents for the slate day.
   */
  private guildMembers(guildId: string) {
    const identities = this.db
      .select({ userId: discordLinks.userId, discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .union(
        this.db
          .select({ userId: account.userId, discordUserId: account.accountId })
          .from(account)
          .where(eq(account.providerId, 'discord')),
      )
      .as('discord_identities');

    return this.db
      .select({ userId: identities.userId })
      .from(identities)
      .innerJoin(
        discordMembers,
        and(
          eq(discordMembers.discordUserId, identities.discordUserId),
          eq(discordMembers.guildId, guildId),
        ),
      )
      .groupBy(identities.userId)
      .as('guild_members');
  }
}
