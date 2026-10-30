/**
 * The calendars a slate post needs.
 *
 * Two clocks, deliberately kept apart:
 *
 * - **Which day a game belongs to** is US/Eastern. NBA schedule days are ET, not
 *   UTC and not the reader's zone: a game tipping at 10:00 PM ET on 27 October is
 *   02:00 UTC on the 28th and belongs to the 27th's slate. The web app already
 *   keys every slate day that way (`apps/frontend/src/lib/game-utils.ts`:
 *   `etDateKey`, `shiftEtDate`, `gameDateKey`), and this file derives the same
 *   keys with the same `Intl` calls, so the bot and the site cannot disagree
 *   about which day a game is on.
 * - **When a guild gets its post** is that guild's own wall clock (`localHour`).
 *   Storing a UTC hour instead would put somebody's slate at 3 a.m. (DISC-09).
 *
 * Nothing here reads the clock on its own: every function takes the instant it
 * should reason about, which is what makes the scheduler testable at any hour.
 */

/** NBA convention, and the same constant the web slate uses. */
export const ET_TIME_ZONE = 'America/New_York';

function partOf(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  type: Intl.DateTimeFormatPartTypes,
): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).formatToParts(
    date,
  );
  return parts.find((part) => part.type === type)?.value ?? '';
}

/** The calendar date of `date` in `timezone`, as `YYYY-MM-DD`. */
export function dateKeyIn(date: Date, timezone: string): string {
  const year = partOf(date, timezone, { year: 'numeric' }, 'year');
  const month = partOf(date, timezone, { month: '2-digit' }, 'month').padStart(2, '0');
  const day = partOf(date, timezone, { day: '2-digit' }, 'day').padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The US/Eastern calendar date of `date`, as `YYYY-MM-DD` — the slate day key. */
export function etDateKey(date: Date): string {
  return dateKeyIn(date, ET_TIME_ZONE);
}

/**
 * `days` after the ET date of `from`, as `YYYY-MM-DD`.
 *
 * Anchored at 12:00 UTC so adding days can never roll across a DST boundary —
 * the same trick `shiftEtDate` uses on the web side.
 */
export function shiftEtDate(days: number, from: Date): string {
  return shiftDateKey(etDateKey(from), days);
}

/** `days` after a `YYYY-MM-DD` key. */
export function shiftDateKey(key: string, days: number): string {
  const anchor = new Date(`${key}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** The hour (0–23) on the wall clock of `timezone`. */
export function localHour(date: Date, timezone: string): number {
  const hour = partOf(date, timezone, { hour: '2-digit', hourCycle: 'h23' }, 'hour');
  return Number.parseInt(hour, 10);
}

/**
 * `HH:MM` on the wall clock of `timezone`, for the `/setup` summary.
 *
 * Both parts come from one `formatToParts` call: asking for minutes alone gives
 * `0`, not `00`, in en-US.
 */
export function localClock(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((part) => part.type === type)?.value ?? '0').padStart(2, '0');
  return `${value('hour')}:${value('minute')}`;
}

/** The minimum a game needs to be placed on a slate day. */
export interface SlateDated {
  /** `schedule_games.gameDate`: the ET date the schedule itself assigns. */
  gameDate?: string | null;
  /** Tip-off, used only when the schedule has no date. */
  gameDateTime?: string | Date | null;
}

/**
 * The ET date key a game is listed under.
 *
 * Same order of preference as the web's `gameDateKey`: the schedule's own ET date
 * first (it is authoritative and survives a tip-off moving), the UTC tip-off
 * converted to ET second, and null when the row has neither.
 */
export function slateDateKey(game: SlateDated): string | null {
  if (game.gameDate) return game.gameDate.slice(0, 10);
  if (!game.gameDateTime) return null;

  const instant =
    game.gameDateTime instanceof Date ? game.gameDateTime : new Date(Date.parse(game.gameDateTime));
  if (Number.isNaN(instant.getTime())) return null;
  return etDateKey(instant);
}

/** `Oct 27` for a `YYYY-MM-DD` key, for message text. */
export function formatDayKey(key: string): string {
  const anchor = new Date(`${key}T12:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return key;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(anchor);
}
