import type { Game } from './api';

/**
 * Schedule dates are US/Eastern, not UTC and not the viewer's zone: a game
 * tipping at 7:00 PM ET belongs to that date for everyone. Every date key here
 * is derived in ET for that reason.
 */
const ET_TIME_ZONE = 'America/New_York';

const HOUR_MS = 60 * 60 * 1000;

const DAY_MS = 24 * HOUR_MS;

export function etDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** `days` after today's ET date, as `YYYY-MM-DD`. Anchored at noon UTC so a DST change cannot roll the day. */
export function shiftEtDate(days: number, from: Date = new Date()): string {
  const anchor = new Date(`${etDateKey(from)}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** `Wed 18 Nov` — the slate's own label, built from the date parts. */
export function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    'en-US',
    { weekday: 'short', day: 'numeric', month: 'short' },
  );
}

/** `7:00 pm` in the league's timezone. */
export function formatTimeET(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: ET_TIME_ZONE,
    })
    .toLowerCase();
}

export type GamePhase = 'scheduled' | 'live' | 'final';

export function gamePhase(game: Game): GamePhase {
  const status = (game.status ?? '').toLowerCase();
  if (status.includes('final')) return 'final';
  if (
    status.includes('live') ||
    status.includes('in progress') ||
    status.includes('halftime') ||
    /q[1-4]|ot|half/.test(status)
  ) {
    return 'live';
  }
  return 'scheduled';
}

/**
 * `in 18h` / `in 45m` / `2h ago` — how far off the tip is.
 *
 * Hours up to two days, because a slate spans one evening and rounding to days
 * made two games on the same night read as `in 1d` and `in 2d`.
 */
export function relativeToTipoff(dateTime: string, now: number = Date.now()): string {
  const tip = new Date(dateTime).getTime();
  if (Number.isNaN(tip)) return '';
  const delta = tip - now;
  const abs = Math.abs(delta);

  if (abs < 60 * 1000) return 'now';

  const label =
    abs < HOUR_MS
      ? `${Math.max(1, Math.floor(abs / (60 * 1000)))}m`
      : abs < 2 * DAY_MS
        ? `${Math.floor(abs / HOUR_MS)}h`
        : `${Math.floor(abs / DAY_MS)}d`;

  return delta >= 0 ? `in ${label}` : `${label} ago`;
}

/** `1 pt` / `18 pts` — settlement can land on the singular. */
export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}

/** The day the slate screens are showing, and the word for it. */
export interface SlateDay {
  /** `YYYY-MM-DD` of the night the games are on. */
  day: string;
  /** `Today`, `Tomorrow`, or null when the next slate is further out. */
  near: 'Today' | 'Tomorrow' | null;
}

/**
 * The day `/games/next` answered with.
 *
 * The day comes from the games' own `gameDate` — the league's calendar, not the
 * viewer's clock — so a player in Jakarta at 2pm on the 25th is shown the 25th's
 * slate, whose games tip that evening, rather than the 26th's. An empty answer
 * (the off-season) falls back to today so the screens still have a date to name.
 */
export function slateDay(games: Game[], now: Date = new Date()): SlateDay {
  const today = etDateKey(now);
  const day = games[0]?.gameDate.slice(0, 10) || today;
  const near = day === today ? 'Today' : day === shiftEtDate(1, now) ? 'Tomorrow' : null;
  return { day, near };
}
