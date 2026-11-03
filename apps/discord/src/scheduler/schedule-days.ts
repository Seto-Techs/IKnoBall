/**
 * The league day, as `schedule_games` sees it.
 *
 * Two readers ask the same two questions — "which day is this game on" and "which
 * days can still be picked" — and they have to answer them identically, or the bot
 * posts a slate for a day it will not fill. So the expression and the query live
 * here once and both callers come through it: `RolloverRepository`, which decides
 * when to roll, and `DrizzleSlateStore`, which the timed post asks for the day.
 *
 * **Duplication worth knowing about.** The ET slate day is derived with the same
 * rule the schedule crawler uses: the feed's `gameDate`, else the tip-off's date.
 * There is no shared constant with the worker because the worker must not depend on
 * the bot's module, so if that rule changes, both copies change.
 */
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { scheduleGames, type Database } from '@iknoball/database';

/**
 * The ET slate day of a `schedule_games` row, in SQL.
 *
 * `gameDate` is the feed's own answer and is what the rest of the bot trusts, so
 * this only falls back to the tip-off's date when it is missing. The `- 6 hours`
 * handles a tip-off that is late evening ET but already the next day UTC: an ET
 * slate day runs from ~19:00 ET to ~02:00 ET the following morning UTC.
 */
export const slateDaySql = sql<string>`
  coalesce(
    ${scheduleGames.gameDate}::text,
    to_char((${scheduleGames.gameDateTimeUTC} - interval '6 hours') at time zone 'UTC', 'YYYY-MM-DD')
  )
`;

/**
 * The schedule's "scheduled" code — a game nobody has started yet.
 *
 * The same code `selectSlateGames` filters on, and it is duplicated there for the
 * same reason the slate day is: that filter is pure and cannot ask a database.
 */
export const STATUS_SCHEDULED = 1;

/**
 * The ET days from `fromKey` on that still have a game a reader can pick,
 * ascending and capped.
 *
 * Not "days with games": a day whose games have all tipped off has nothing left to
 * pick, and a post for it sends an empty slate. Offering one to the rollover wedges
 * the guild — the roll succeeds as `empty`, the day key is purposely not remembered
 * for an empty day, so the next tick makes the same choice every minute with
 * `lastPostedKey` never moving. A guild two days behind would never catch up, and
 * only its timed post would rescue it.
 *
 * So this answers the question both callers actually ask: from this day on (never a
 * day already finished), which days still have a game a reader can pick. Same rule
 * `selectSlateGames` applies when it builds the cards.
 */
export async function pickableDays(
  db: Database,
  fromKey: string,
  now: Date,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slateKey: slateDaySql })
    .from(scheduleGames)
    .where(
      and(
        sql`${slateDaySql} >= ${fromKey}`,
        eq(scheduleGames.gameStatus, STATUS_SCHEDULED),
        gt(scheduleGames.gameDateTimeUTC, now),
      ),
    )
    .orderBy(asc(slateDaySql))
    .limit(limit);

  return rows.map((row) => row.slateKey);
}
