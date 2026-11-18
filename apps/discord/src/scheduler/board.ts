/**
 * The bot's one scheduled post: the daily leaderboard (0.5.1).
 *
 * The bot used to post two things: the pick cards at each guild's local hour, and a
 * recap of the finished slate the moment the next day's cards rolled out. Picks moved
 * into the Activity, so the cards are gone, the rollover is gone with them, and the
 * recap is what is left — it no longer rides on another post.
 *
 * That leaves one question: **which league day is the board for?** The most recent
 * day whose games are all done, so the board a guild sees at 9 a.m. is the board for
 * last night. `BoardRepository` asks Postgres; this file decides, and it is pure — no
 * clock, no database, no gateway — so every branch is a unit test rather than a timed
 * integration.
 */
import type { PredictionMode } from '@iknoball/predictions';

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

/** One league day, as `schedule_games` sees it. */
export interface DayState {
  slateKey: string;
  games: number;
  finals: number;
  lastTipOff: Date | null;
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
 * what lets a failed post retry — the next tick sees the same day — so a failure inside
 * the guild's `postHour` hour costs a late board rather than a missing one.
 *
 * That window is the hour, not the day. `BoardScheduler.runForGuild` answers `not-due`
 * outside it, so a deploy that spans the whole hour loses that morning's board: by the
 * next tick there is a newer finished day, and the one that was missed is behind it.
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
