import { Logger } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { scheduleDays, scheduleGames } from '@iknoball/database';
import type { DatabaseService } from '../infrastructure/database/database.service';

/**
 * NBA seasons are labelled by the two calendar years they span ("2026-27") and
 * run October → June. Rosters start moving as soon as free agency opens in July,
 * so from July onward the upcoming season is the one whose stats and rosters the
 * feeds describe; before July we are still inside the season that began last
 * October.
 */
const ROLLOVER_MONTH = 7;

/** How close to opening night the new season takes over from the previous one. */
const PRESEASON_GRACE_DAYS = 7;

const logger = new Logger('Season');

/**
 * The last env/calendar disagreement already reported, so a forgotten bump is
 * called out once instead of on every request.
 */
let warnedEnvDisagreement: string | null = null;

/** Season label (e.g. "2026-27") that the given date belongs to. */
export function seasonForDate(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const firstYear = month >= ROLLOVER_MONTH ? year : year - 1;
  return `${firstYear}-${String((firstYear + 1) % 100).padStart(2, '0')}`;
}

/** The season before `season` ('2026-27' -> '2025-26'). */
export function getPreviousSeason(season: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  const first = parseInt(m[1], 10) - 1;
  return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}

/**
 * Opening night as a last resort, for a season with nothing on file yet.
 *
 * The exact date moves a day or two year to year, which does not matter: the
 * grace window is a week wide, and the real date comes from the schedule as soon
 * as the worker syncs it. Deriving it keeps this from becoming one more list of
 * seasons to remember to bump.
 */
function defaultSeasonStart(season: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[1], 10), 9, 20));
}

/** The first tip-off of `season`, or null when nothing on file pins it. */
export async function resolveSeasonStart(
  db: DatabaseService['db'],
  season: string,
): Promise<Date | null> {
  if (process.env.NBA_SEASON_START_DATE) {
    const d = new Date(process.env.NBA_SEASON_START_DATE);
    if (!Number.isNaN(d.getTime())) return d;
  }
  try {
    const rows = await db
      .select({ dt: scheduleGames.gameDateTimeUTC })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(and(eq(scheduleDays.seasonYear, season), sql`${scheduleGames.gameLabel} = ''`))
      .orderBy(asc(scheduleGames.gameDateTimeUTC))
      .limit(1);
    if (rows.length && rows[0].dt) return rows[0].dt as Date;
  } catch {}
  return defaultSeasonStart(season);
}

/**
 * The season the API leads with.
 *
 * `NBA_CURRENT_SEASON` wins whenever it is set: it is the operator's explicit
 * statement of which season the deployment is serving, and a value that cannot
 * override anything is worse than no value at all. It is served as written, with
 * no pre-season adjustment — an operator who names a season has already decided
 * whether its data exists yet.
 *
 * The calendar is the fallback for a deploy that has not set it, so a missing
 * value can never pin the API to a hardcoded year — the failure that left the
 * team endpoints on 2025-26. Only that derived path needs the pre-season grace
 * window, because only it is guessing: more than a week before opening night the
 * previous season still holds the only stats there are.
 *
 * A disagreement between the two is logged once per process. It is not an error
 * — the configured season is served either way — but a forgotten bump is exactly
 * how the API ends up a season behind the worker, which syncs by the calendar.
 */
export async function resolveCurrentSeason(
  db: DatabaseService['db'],
  now: Date = new Date(),
): Promise<string> {
  const configured = process.env.NBA_CURRENT_SEASON?.trim();
  const calendarSeason = seasonForDate(now);

  if (configured) {
    if (configured !== calendarSeason) {
      const key = `${configured}->${calendarSeason}`;
      if (warnedEnvDisagreement !== key) {
        warnedEnvDisagreement = key;
        logger.warn(
          `NBA_CURRENT_SEASON=${configured} disagrees with the calendar (${calendarSeason}); serving the configured season`,
        );
      }
    }
    return configured;
  }

  const start = await resolveSeasonStart(db, calendarSeason);
  if (!start || Number.isNaN(start.getTime())) return calendarSeason;
  const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntil > PRESEASON_GRACE_DAYS ? getPreviousSeason(calendarSeason) : calendarSeason;
}
