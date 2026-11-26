/**
 * The bot's daily post: the leaderboard.
 *
 * The bot used to post two things: the pick cards at each guild's local hour, and a
 * recap of the finished slate the moment the next day's cards rolled out. Picks moved
 * into the Activity, so the per-guild local hour and the rollover are gone; the cards
 * now ride with the board at midnight ET, and the recap no longer depends on another
 * post to carry it.
 *
 * That leaves one question: **which league day is the board for?** The most recent
 * day whose games are all done, so the board a guild sees at midnight is the board for
 * the day that just ended. `BoardRepository` asks Postgres; this file decides, and it is pure — no
 * clock, no database, no gateway — so every branch is a unit test rather than a timed
 * integration.
 */
import type { PredictionMode } from '@iknoball/predictions';
import { etMidnight, shiftDateKey } from './slate-date';

/**
 * How long after the last scheduled tip-off a league day counts as over, even if the
 * feed has not marked every game final.
 *
 * The primary signal is `gameStatus = 3` on every game. This is the backstop for the
 * feed going quiet or a postponed game that keeps its original tip-off: a 22:00 ET
 * tip-off ends around 00:30, so four hours is late enough that nothing is still in
 * progress and early enough that a stuck day costs one morning's board rather than a
 * whole day of them.
 */
export const DAY_OVER_GRACE_MS = 4 * 60 * 60 * 1000;

/**
 * How long after the last final the board waits before it goes out.
 *
 * Settlement runs after the buzzer, and a board posted on the buzzer ranks the night
 * without its last picks. Fifteen minutes is long enough for that pass and short
 * enough that nobody is still watching the game when it lands.
 */
export const RECAP_SETTLE_MS = 15 * 60 * 1000;

/** One league day, as `schedule_games` sees it. */
export interface DayState {
  slateKey: string;
  games: number;
  finals: number;
  lastTipOff: Date | null;
  /**
   * When the last game of the day finished, or null when the feed never said.
   *
   * Derived from the box score summary (`gameTimeUTC` + `duration`), because
   * `schedule_games` only knows the tip-off: a row's `updatedAt` is when the crawler
   * last saw it, which lags the buzzer by up to half an hour and would push the board
   * later for no reason.
   */
  lastFinalAt: Date | null;
}

/**
 * Whether one league day is over.
 *
 * Every game final, or the last tip-off far enough in the past that "final" is a
 * formality. See `DAY_OVER_GRACE_MS` for why the second half exists.
 */
export function isDayOver(day: DayState, now: Date): boolean {
  if (day.games === 0) return true;
  if (day.finals >= day.games) return true;
  if (day.lastTipOff === null) return true;
  return day.lastTipOff.getTime() + DAY_OVER_GRACE_MS <= now.getTime();
}

/**
 * The day the board is for, or null when nothing has finished yet.
 *
 * The **latest** finished day, not today's: the board ranks settled picks, and today's
 * are not settled until the last game of tonight is. Choosing the latest one is also
 * what lets a failed post retry — the next tick sees the same day — so a failure
 * before the board's minute costs a late board rather than a missing one.
 *
 * That minute is `recapDueAt`, not the day. A deploy that spans it loses that day's
 * board: by the next tick there is a newer finished day, and the one that was missed
 * is behind it. The window is deliberately wide in practice — `latestFinishedDay` only
 * stops offering a day when a newer one is *also* over, which for a back-to-back
 * schedule is the following night — so a bot that is down for an evening still posts
 * that evening's board the next morning.
 *
 * The `games === 0` skip is defensive. `BoardRepository.daysSince` groups from
 * `schedule_games`, so a day with no games produces no row at all, and an off day is
 * announced by `noteOffDay`'s `hasGames(today)` instead. Kept because this function is
 * pure and its contract should not depend on how the caller happens to query.
 */
export function latestFinishedDay(days: readonly DayState[], now: Date): DayState | null {
  let latest: DayState | null = null;

  for (const day of days) {
    if (day.games === 0) continue;
    if (!isDayOver(day, now)) continue;
    if (latest === null || day.slateKey > latest.slateKey) latest = day;
  }

  return latest;
}

/**
 * When a finished day's board may go out.
 *
 * Two floors, and the later one wins:
 *
 * - **Midnight ET, the day after the slate.** The board closes the league day, and the
 *   league day is US/Eastern for every guild, so this is one instant for the whole
 *   fleet rather than one per server. A slate that finishes at 22:15 ET posts at
 *   00:00 ET, not the moment the last buzzer settles.
 * - **Fifteen minutes after the last final** (`RECAP_SETTLE_MS`). The floor that makes
 *   midnight safe: a west-coast game can finish at 00:30 ET, and the board waits for it
 *   rather than recapping a night that was not over.
 *
 * A day the feed never marked final falls back to the last tip-off plus
 * `DAY_OVER_GRACE_MS`, the same backstop `isDayOver` uses, so a missing box score
 * summary costs the board its exact minute rather than the board.
 */
export function recapDueAt(day: DayState): Date {
  const midnight = etMidnight(shiftDateKey(day.slateKey, 1)).getTime();
  const final =
    day.lastFinalAt ??
    (day.lastTipOff ? new Date(day.lastTipOff.getTime() + DAY_OVER_GRACE_MS) : null);

  return new Date(
    final === null ? midnight : Math.max(midnight, final.getTime() + RECAP_SETTLE_MS),
  );
}

/**
 * Which modes the board shows.
 *
 * Both, by default, for the same reason `/leaderboard` shows both: the two boards rank
 * the same people by different points and a reader compares them side by side. A
 * caller that asked for one mode gets one.
 */
export function recapModes(requested: PredictionMode | null): PredictionMode[] {
  return requested ? [requested] : ['flat', 'weighted'];
}

/**
 * Whether a board is worth posting at all.
 *
 * A board for a day nobody picked is an empty table in a channel, which reads as the
 * bot being broken. The threshold is one settled pick: a guild that watched a whole
 * slate go by without a single pick gets nothing.
 */
export function shouldPostRecap(settledPicks: number): boolean {
  return settledPicks > 0;
}

/**
 * The single line that introduces the board.
 *
 * Deliberately not a heading over the whole embed: the embed is the one `/leaderboard`
 * renders, so the line only has to say *why* it appeared unprompted. A day with no
 * picks never reaches here — `shouldPostRecap` stops it.
 */
export function recapIntro(day: string, settledPicks: number): string {
  const picks = settledPicks === 1 ? '1 pick' : `${settledPicks} picks`;
  return `**${day} is final** — ${picks} settled. How the server finished:`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * `2026-11-17` as `Tue 17 Nov`, for the recap card's date line.
 *
 * Built from the parts rather than through a locale: the card is a picture, so the
 * words cannot be left to whatever ICU the container happens to ship. The key is
 * parsed at noon UTC because a bare date parses as UTC midnight, and formatting that
 * in a zone west of UTC names the day before.
 */
export function formatDayLabel(dayKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (Number.isNaN(date.getTime())) return dayKey;

  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
