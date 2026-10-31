/**
 * When the bot posts again by itself, and what it posts (0.3.1).
 *
 * Before this, the only post was the one `/setup` schedules: a guild's local
 * `postHour`, once per ET slate day. A server that wanted the next slate had to
 * wait for that hour, and the day's leaderboard was only ever something a member
 * had to ask for with `/leaderboard`.
 *
 * This file is the decision layer for two extra posts, and nothing else:
 *
 * 1. **The rollover.** Once the league's slate day D is over, the slate for the
 *    next ET day with games is posted — immediately, not at `postHour`. The slate
 *    is what a picker is waiting for, and holding it until 9 a.m. after the last
 *    game of the night is the gap this closes.
 * 2. **The recap.** That same moment is when "today's picks" is worth showing: the
 *    board as it stands once the last game is final.
 *
 * Pure: no clock, no database, no gateway. `rolloverDecision` is handed the facts
 * and answers what to do, so every branch is a unit test rather than a timed
 * integration. `RolloverScheduler` asks it every minute.
 */
import type { PredictionMode } from '@iknoball/predictions';

/**
 * What a guild's slate day looks like right now.
 *
 * A guild with no cards at all is not described here: the caller skips it, because
 * a guild that has never been posted has no day to have finished.
 */
export interface RolloverState {
  /** ET slate day the guild was last posted, e.g. `2026-10-30`. */
  lastPostedKey: string;
  /**
   * Whether that league day is done.
   *
   * Read off `schedule_games`, not off our own cards: every game final, or the day
   * long past. A card that can never settle — its message was deleted, or the bot
   * was kicked from the channel — must not wedge this guild's rollover forever,
   * which is what gating on `settledAt` would do.
   */
  dayOver: boolean;
  /** The next ET slate day that has games, or null when the season is quiet. */
  nextKey: string | null;
}

export type RolloverReason =
  /** Games on the last posted day are not all final yet. */
  | 'day-open'
  /** No upcoming day has games: the schedule is empty. */
  | 'no-next-day'
  /** The next day is not later than the last one: already posted. */
  | 'already-current'
  /** The day is over and a later day exists. */
  | 'roll';

export interface RolloverDecision {
  roll: boolean;
  reason: RolloverReason;
  /** The day to post when `roll` is true. */
  targetKey: string | null;
}

/**
 * Decide whether to roll a guild onto the next slate day.
 *
 * The order of the checks is the order a reader would ask the questions, and the
 * first `false` wins:
 *
 * - `!dayOver` — a game is still live. Rolling now would replace a slate mid-day.
 * - `nextKey === null` — the season is quiet. Nothing to roll to.
 * - `nextKey <= lastPostedKey` — the scheduler already posted it (or a previous
 *   rollover did), so this is the "already posted" no-op rather than a second post.
 *
 * A rolled day is a *later* day, and the comparison is a plain string compare
 * because slate keys are `YYYY-MM-DD`: lexicographic order is date order. A
 * `nextKey` earlier than `lastPostedKey` is treated as not-a-roll for the same
 * reason: it would re-post history.
 */
export function rolloverDecision(state: RolloverState): RolloverDecision {
  const { lastPostedKey, dayOver, nextKey } = state;

  if (!dayOver) {
    return { roll: false, reason: 'day-open', targetKey: null };
  }

  if (nextKey === null) {
    return { roll: false, reason: 'no-next-day', targetKey: null };
  }

  if (nextKey <= lastPostedKey) {
    return { roll: false, reason: 'already-current', targetKey: null };
  }

  return { roll: true, reason: 'roll', targetKey: nextKey };
}

/**
 * Which modes a recap shows.
 *
 * Both, by default, for the same reason `/leaderboard` shows both: the two boards
 * rank the same people by different points and a reader compares them side by
 * side. A caller that asked for one mode gets one.
 */
export function recapModes(requested: PredictionMode | null): PredictionMode[] {
  return requested ? [requested] : ['flat', 'weighted'];
}

/**
 * Whether a recap is worth posting at all.
 *
 * A recap of a day nobody picked is an empty table in a channel, which reads as
 * the bot being broken. The threshold is one settled pick, not one card: a guild
 * that watched a whole slate go by without a single pick gets nothing.
 */
export function shouldPostRecap(settledPicks: number): boolean {
  return settledPicks > 0;
}

/**
 * The single line that introduces a recap.
 *
 * Deliberately not a heading over the whole board: the board is the same embed
 * `/leaderboard` renders, so the line only has to say *why* it appeared
 * unprompted. A day with no picks never reaches here — `shouldPostRecap` stops it.
 */
export function recapIntro(day: string, settledPicks: number): string {
  const picks = settledPicks === 1 ? '1 pick' : `${settledPicks} picks`;
  return `**${day} is final** — ${picks} settled. How the server finished:`;
}
