/**
 * When the bot posts again by itself, and what it posts (0.3.1 prototype).
 *
 * Today the only post is the one `/setup` schedules: a guild's local `postHour`,
 * once per ET slate day. A server that wants the next slate has to wait for that
 * hour, and the day's leaderboard is only ever something a member has to ask for
 * with `/leaderboard`.
 *
 * This file is the decision layer for two extra posts, and nothing else:
 *
 * 1. **The rollover.** Once every card a guild was given for slate day D has
 *    settled, the slate for the next ET day with games is posted — immediately,
 *    not at `postHour`. The slate is what a picker is waiting for, and holding it
 *    until 9 a.m. after the last game of the night is the gap this closes.
 * 2. **The recap.** That same moment is when "today's picks" is worth showing: the
 *    board as it stands once the last game is final.
 *
 * Pure: no clock, no database, no gateway. `rolloverDecision` is handed the
 * facts and answers what to do, so every branch is a unit test rather than a
 * timed integration.
 */
import type { PredictionMode } from '@iknoball/predictions';

/** What a guild's slate day looks like right now. */
export interface RolloverState {
  /** ET slate day the guild was last posted, e.g. `2026-10-30`. */
  lastPostedKey: string;
  /**
   * How many cards for `lastPostedKey` are still unsettled.
   *
   * Zero means the day is over: every game the guild was shown is final and its
   * card has been edited with the result.
   */
  unsettledCards: number;
  /** How many cards were posted for `lastPostedKey` at all. */
  totalCards: number;
  /** The next ET slate day that has games, or null when the season is quiet. */
  nextKey: string | null;
}

export type RolloverReason =
  /** Cards are still unsettled: the day is not over. */
  | 'day-open'
  /** Nothing was posted for the last day, so there is nothing to roll over from. */
  | 'nothing-posted'
  /** No upcoming day has games: the schedule is empty. */
  | 'no-next-day'
  /** The next day is the same as the last one: already posted. */
  | 'already-current'
  /** Every card settled and a later day exists. */
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
 * - `totalCards === 0` — the guild was never posted (or the post was empty), so
 *   there is no day to have finished. Rolling here would post a slate the guild
 *   never asked for on a schedule it never set.
 * - `unsettledCards > 0` — a game is still live. Rolling now would replace a
 *   slate mid-day.
 * - `nextKey === null` — the season is quiet. Nothing to roll to.
 * - `nextKey === lastPostedKey` — the scheduler already posted it (or a previous
 *   rollover did), so this is the "already posted" no-op rather than a second post.
 *
 * A rolled day is a *later* day, and the comparison is a plain string compare
 * because slate keys are `YYYY-MM-DD`: lexicographic order is date order. A
 * `nextKey` earlier than `lastPostedKey` is treated as not-a-roll for the same
 * reason `already-current` is: it would re-post history.
 */
export function rolloverDecision(state: RolloverState): RolloverDecision {
  const { lastPostedKey, unsettledCards, totalCards, nextKey } = state;

  if (totalCards === 0) {
    return { roll: false, reason: 'nothing-posted', targetKey: null };
  }

  if (unsettledCards > 0) {
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

/** The ET slate day a recap is about. */
export interface RecapDay {
  /** `YYYY-MM-DD`, the ET slate day whose games have just finished. */
  key: string;
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
