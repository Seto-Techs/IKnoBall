/**
 * The database half of the rollover prototype (0.3.1).
 *
 * `rollover.ts` decides; this asks the two questions that decision needs, plus the
 * one the recap needs, and nothing else. It is deliberately separate from
 * `SlateStore` and `CardSweepRepository`: those two own the posting and editing
 * paths, and a prototype should not widen them before the shape is agreed.
 *
 * **Prototype scope.** These queries are written against the real tables and the
 * real ET slate key, so they are the queries the feature would ship with. What is
 * *not* here is the scheduler that calls them on a cron, the store method that
 * posts the next day, and the "have I already recapped this day" guard — see the
 * notes at the bottom for why each is a decision rather than typing.
 */
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import {
  discordCards,
  discordGuilds,
  predictionPicks,
  scheduleGames,
  type Database,
} from '@iknoball/database';
import { STATUS_FINAL } from '../lock/card-edit';
import type { RolloverState } from './rollover';
import { shiftDateKey } from './slate-date';

/** DI token, matching the style of `SLATE_STORE` and `DAY_KEY_GUARD`. */
export const ROLLOVER_REPOSITORY = 'ROLLOVER_REPOSITORY';

/** Everything the rollover decision needs about one guild, from Postgres. */
export interface GuildRolloverState extends RolloverState {
  guildId: string;
}

/**
 * The ET slate day of a `schedule_games` row, in SQL.
 *
 * `gameDate` is the feed's own answer and is what the rest of the bot trusts, so
 * this only falls back to the tip-off's date when it is missing. The `- 1 day`
 * handles a tip-off that is late evening ET but already the next day UTC: an ET
 * slate day runs from ~19:00 ET to ~02:00 ET the following morning UTC.
 */
const slateDaySql = sql<string>`
  coalesce(
    ${scheduleGames.gameDate},
    to_char((${scheduleGames.gameDateTimeUTC} - interval '6 hours') at time zone 'UTC', 'YYYY-MM-DD')
  )
`;

export class RolloverRepository {
  constructor(private readonly db: Database) {}

  /**
   * The state of every guild that has ever been posted to.
   *
   * One query per guild would be a sweep of N+1; this does it in three, and the
   * caller decides what to do with the rows. A guild with no cards is not
   * returned at all, which is what `rolloverDecision` would answer anyway.
   */
  async statesForAllGuilds(now: Date = new Date()): Promise<GuildRolloverState[]> {
    // 1. The latest slate day each guild was posted, and how many cards it got.
    const posted = await this.db
      .select({
        guildId: discordCards.guildId,
        // The card row's own `createdAt` is the post time; the slate day is the
        // ET day of the game it was posted for.
        lastPostedKey: sql<string>`max(${slateDaySql})`,
        totalCards: count(),
      })
      .from(discordCards)
      .innerJoin(scheduleGames, eq(scheduleGames.id, discordCards.gameId))
      .groupBy(discordCards.guildId);

    if (posted.length === 0) return [];

    // 2. How many of each guild's latest-day cards are still unsettled. Counted
    //    over the same join so a card whose game row vanished cannot look settled.
    const unsettled = await this.db
      .select({
        guildId: discordCards.guildId,
        slateKey: slateDaySql,
        open: count(),
      })
      .from(discordCards)
      .innerJoin(scheduleGames, eq(scheduleGames.id, discordCards.gameId))
      .where(isNull(discordCards.settledAt))
      .groupBy(discordCards.guildId, slateDaySql);

    const openByGuildAndDay = new Map<string, number>();
    for (const row of unsettled) {
      openByGuildAndDay.set(`${row.guildId}:${row.slateKey}`, Number(row.open));
    }

    // 3. The next slate day with games, per guild's last day. Asked once for the
    //    earliest upcoming day rather than per guild: every guild rolls onto the
    //    same league schedule, so one answer covers all of them.
    const upcoming = await this.upcomingDays(now);

    return posted.map((row) => {
      const guildId = row.guildId;
      const lastPostedKey = row.lastPostedKey;
      const nextKey = upcoming.find((day) => day > lastPostedKey) ?? null;

      return {
        guildId,
        lastPostedKey,
        totalCards: Number(row.totalCards),
        unsettledCards: openByGuildAndDay.get(`${guildId}:${lastPostedKey}`) ?? 0,
        nextKey,
      };
    });
  }

  /**
   * Slate days at or after today that actually have games.
   *
   * Ascending, capped: the rollover only ever wants the first one after a guild's
   * last day, and a whole season of days is not worth materialising to find it.
   */
  async upcomingDays(now: Date, limit = 30): Promise<string[]> {
    const from = shiftDateKey(etDayKey(now), -1);

    const rows = await this.db
      .selectDistinct({ slateKey: slateDaySql })
      .from(scheduleGames)
      .where(and(sql`${slateDaySql} >= ${from}`))
      .orderBy(asc(slateDaySql))
      .limit(limit);

    return rows.map((row) => row.slateKey);
  }

  /**
   * How many picks settled for a guild on one slate day.
   *
   * The recap's gate: a day nobody picked is a day with nothing to show. Counted
   * off `prediction_picks` rather than `discord_members` because the board ranks
   * picks, and a settled pick is what a row on it represents.
   */
  async settledPickCount(guildId: string, slateKey: string): Promise<number> {
    const [row] = await this.db
      .select({ settled: count() })
      .from(predictionPicks)
      .innerJoin(scheduleGames, eq(scheduleGames.id, predictionPicks.gameId))
      .where(
        and(
          eq(predictionPicks.guildId, guildId),
          eq(predictionPicks.status, 'settled'),
          sql`${slateDaySql} = ${slateKey}`,
        ),
      );

    return Number(row?.settled ?? 0);
  }

  /** Enabled guilds only: a paused guild gets no unprompted post of any kind. */
  async enabledGuildIds(): Promise<string[]> {
    const rows = await this.db
      .select({ guildId: discordGuilds.guildId })
      .from(discordGuilds)
      .where(eq(discordGuilds.enabled, true));

    return rows.map((row) => row.guildId);
  }

  /** Final games on a slate day, for a caller that wants to know the day is done. */
  async allFinal(slateKey: string): Promise<boolean> {
    const [row] = await this.db
      .select({
        total: count(),
        finals: sql<number>`count(*) filter (where ${scheduleGames.gameStatus} = ${STATUS_FINAL})`,
      })
      .from(scheduleGames)
      .where(sql`${slateDaySql} = ${slateKey}`);

    const total = Number(row?.total ?? 0);
    return total > 0 && Number(row?.finals ?? 0) === total;
  }
}

/** `YYYY-MM-DD` in US/Eastern, matching `etDateKey`. */
function etDayKey(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'US/Eastern',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * What is still missing before this could ship, and why each is a decision:
 *
 * - **A scheduler.** The natural hook is `SettlementSweepService`: it already runs
 *   every minute and already knows which cards just settled. The decision here
 *   answers "should this guild roll", but *when* to ask it (after a settle run
 *   that changed something, versus every minute regardless) changes how many
 *   queries run per minute per guild. Every minute is simpler and costs one
 *   aggregate; on-change is cheaper and needs the sweep to report a delta.
 * - **A durable recap guard.** `discord_cards` has `lockedAt`/`settledAt`; there
 *   is no column that means "this guild has been recapped for this day". Redis
 *   with a multi-day TTL would do, the way `DayKeyGuard` does, but a Redis flush
 *   would then double-post a recap. A `discord_guild_recaps` table (guildId,
 *   slateKey, postedAt, messageId) is the durable answer and is a migration.
 * - **Posting the next slate.** `SlatePoster.post` posts *today* by ET key and
 *   claims cards through `SlateStore`. Rolling to tomorrow needs either a
 *   `postFor(target, etKey)` parameter or a store that accepts the day; today's
 *   signature cannot express it.
 * - **Where the recap goes.** `SlateTarget` carries one channel. A recap after
 *   midnight in the guild's zone lands in a channel the guild configured for
 *   morning posts; whether that is the right place, or whether it needs its own
 *   `/setup` option, is a product call.
 */
