/**
 * The database half of the rollover (0.3.1).
 *
 * `rollover.ts` decides; this asks the three questions that decision needs, plus
 * the one the recap needs, and nothing else. It is deliberately separate from
 * `SlateStore` and `CardSweepRepository`: those two own the posting and editing
 * paths, and a scheduling question should not widen them.
 *
 * Three queries per minute, whatever the guild count: the last day each guild was
 * posted, the state of each league day since a week ago, and the days ahead that
 * still have a game to pick. Every guild rolls onto the same league schedule, so
 * the last two are shared.
 *
 * **Duplication worth knowing about.** The ET slate day is derived here with the
 * same rule the schedule crawler uses: the feed's `gameDate`, else the tip-off's
 * date. There is no shared constant because the worker must not depend on the
 * bot's module, so if that rule changes, both copies change.
 */
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
import { discordCards, predictionPicks, scheduleGames, type Database } from '@iknoball/database';
import { STATUS_FINAL } from '../lock/card-edit';
import type { RolloverState } from './rollover';
import { Infrastructure } from './infrastructure';
import { etDateKey, shiftDateKey } from './slate-date';

/**
 * How long after the last scheduled tip-off a league day counts as over, even if
 * the feed has not marked every game final.
 *
 * The primary signal is `gameStatus = 3` on every game. This is the backstop for
 * the feed going quiet or a postponed game that keeps its original tip-off: a
 * 22:00 ET tip-off ends around 00:30, so four hours is late enough that nothing is
 * still in progress and early enough that a stuck day delays tomorrow's slate by
 * hours rather than a whole day. It is a *lower* bound on correctness — posting
 * tomorrow's slate early costs nothing, since its games are still hours away.
 */
const DAY_OVER_GRACE_MS = 4 * 60 * 60 * 1000;

/** How far back the per-day query looks; a guild idle for longer than this is long done. */
const DAY_WINDOW_DAYS = 7;

/**
 * The schedule's "scheduled" code — a game nobody has started yet.
 *
 * The same code `selectSlateGames` filters on, and it is duplicated here for the
 * same reason the slate day is: this query has to know what a postable game is
 * without asking the poster.
 */
const STATUS_SCHEDULED = 1;

/** Everything the rollover decision needs about one guild, from Postgres. */
export interface GuildRolloverState extends RolloverState {
  guildId: string;
}

/** One league day, as `schedule_games` sees it. */
export interface DayState {
  slateKey: string;
  games: number;
  finals: number;
  lastTipOff: Date | null;
}

/**
 * The ET slate day of a `schedule_games` row, in SQL.
 *
 * `gameDate` is the feed's own answer and is what the rest of the bot trusts, so
 * this only falls back to the tip-off's date when it is missing. The `- 6 hours`
 * handles a tip-off that is late evening ET but already the next day UTC: an ET
 * slate day runs from ~19:00 ET to ~02:00 ET the following morning UTC.
 */
const slateDaySql = sql<string>`
  coalesce(
    ${scheduleGames.gameDate}::text,
    to_char((${scheduleGames.gameDateTimeUTC} - interval '6 hours') at time zone 'UTC', 'YYYY-MM-DD')
  )
`;

export class RolloverRepository {
  constructor(private readonly infra: Infrastructure) {}

  /**
   * Resolved on use, not on construction: `DatabaseService` is a provider of the
   * root module, which exports nothing, so this goes through `Infrastructure` the
   * way every other data-backed provider here does — including `DrizzleSlateStore`.
   */
  private get db(): Database {
    return this.infra.db;
  }

  /**
   * The state of every guild that has ever been posted to.
   *
   * One query per guild would be a sweep of N+1; this does it in three, and the
   * caller decides what to do with the rows. A guild with no cards is not returned
   * at all — it has no finished day to roll over from.
   */
  async statesForAllGuilds(now: Date = new Date()): Promise<GuildRolloverState[]> {
    // 1. The latest slate day each guild was posted.
    //
    // `gameId`, never `id`: a card stores the feed's game id (`0022600123`), and
    // `schedule_games.id` is an unrelated UUID. Joining on `id` matches nothing,
    // which reads as "no guild has ever been posted" and silently stops every
    // rollover — the failure this code shipped with once.
    const posted = await this.db
      .select({
        guildId: discordCards.guildId,
        lastPostedKey: sql<string>`max(${slateDaySql})`,
      })
      .from(discordCards)
      .innerJoin(scheduleGames, eq(scheduleGames.gameId, discordCards.gameId))
      .groupBy(discordCards.guildId);

    if (posted.length === 0) return [];

    // 2. How each of the last week's league days stands, and 3. which of the days
    //    ahead a guild could still be shown. Both are league-wide, so one answer
    //    covers every guild.
    const [days, postable] = await Promise.all([this.dayStates(now), this.postableDays(now)]);
    const byDay = new Map(days.map((day) => [day.slateKey, day]));
    const floor = shiftDateKey(etDateKey(now), -DAY_WINDOW_DAYS);

    return posted.map((row) => {
      const { guildId, lastPostedKey } = row;
      const day = byDay.get(lastPostedKey);

      return {
        guildId,
        lastPostedKey,
        // A day that dropped out of the window, or out of the schedule entirely,
        // is not a day anyone is still waiting on.
        dayOver: lastPostedKey < floor || day === undefined || isDayOver(day, now),
        nextKey: postable.find((key) => key > lastPostedKey) ?? null,
      };
    });
  }

  /**
   * How many picks settled for a guild on one slate day.
   *
   * The recap's gate: a day nobody picked is a day with nothing to show. Counted
   * off `prediction_picks` rather than `discord_cards` because the board ranks
   * picks, and a settled pick is what a row on it represents.
   */
  async settledPickCount(guildId: string, slateKey: string): Promise<number> {
    // Same rule as above: `prediction_picks.gameId` is the feed's id, so the join
    // is on `scheduleGames.gameId`. On `id` this counts zero for every day and the
    // recap never posts.
    const [row] = await this.db
      .select({ settled: count() })
      .from(predictionPicks)
      .innerJoin(scheduleGames, eq(scheduleGames.gameId, predictionPicks.gameId))
      .where(
        and(
          eq(predictionPicks.guildId, guildId),
          eq(predictionPicks.status, 'settled'),
          sql`${slateDaySql} = ${slateKey}`,
        ),
      );

    return Number(row?.settled ?? 0);
  }

  /**
   * Every league day from a week ago onwards, so a caller can answer "is this day
   * done".
   *
   * Bounded backwards on purpose: a guild's last posted day is only interesting
   * while it is recent, and a day that fell out of the window is reported as over
   * by the caller rather than queried for. There is deliberately **no** upper
   * bound. A rolled-over guild is already holding tomorrow's cards, so tomorrow has
   * to be in this answer; a day missing from it reads as over, and the next tick
   * would roll again and post a slate per minute until it caught up with the
   * calendar.
   */
  private async dayStates(now: Date): Promise<DayState[]> {
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
      // `pg` hands a `timestamp` back as a `Date`, but the column carries no zone,
      // so it is normalised here rather than trusted.
      lastTipOff: row.lastTipOff === null ? null : new Date(row.lastTipOff),
    }));
  }

  /**
   * The slate days a guild can still be given, ascending and capped.
   *
   * Not "days with games": a day whose games have all tipped off has nothing left
   * to pick, and `postFor` sends it as an empty slate. Offering one to the decision
   * layer wedges the guild — the roll succeeds as `empty`, the day key is purposely
   * not remembered for an empty day, so the next tick makes the same choice every
   * minute with `lastPostedKey` never moving. A guild two days behind would never
   * catch up, and only its timed post would rescue it.
   *
   * So this answers the question the decision actually asks: from today on (never a
   * day already finished), which days still have a game a reader can pick. Same
   * rule `selectSlateGames` applies when it builds the cards.
   */
  private async postableDays(now: Date, limit = 30): Promise<string[]> {
    const from = etDateKey(now);

    const rows = await this.db
      .selectDistinct({ slateKey: slateDaySql })
      .from(scheduleGames)
      .where(
        and(
          sql`${slateDaySql} >= ${from}`,
          eq(scheduleGames.gameStatus, STATUS_SCHEDULED),
          gt(scheduleGames.gameDateTimeUTC, now),
        ),
      )
      .orderBy(asc(slateDaySql))
      .limit(limit);

    return rows.map((row) => row.slateKey);
  }
}

/**
 * Whether one league day is over.
 *
 * Every game final, or the last tip-off far enough in the past that "final" is a
 * formality. See `DAY_OVER_GRACE_MS` for why the second half exists.
 */
function isDayOver(day: DayState, now: Date): boolean {
  if (day.games === 0) return true;
  if (day.finals === day.games) return true;
  if (day.lastTipOff === null) return true;
  return day.lastTipOff.getTime() + DAY_OVER_GRACE_MS <= now.getTime();
}
