import type { CardStake } from '../cards/types';

/**
 * Whether two prices would print the same points line, which is the only thing
 * that makes a posted card worth editing for its points.
 *
 * The comparison is on the points, not on the decimal prices or the snapshot row:
 * the worker captures a fresh snapshot every few minutes and the card only shows
 * what `potentialPoints` made of it, so a re-captured line that has not moved is
 * not a reason to PATCH a message. Two cards on the same game can also disagree —
 * they were written minutes apart — which is why the caller compares one card with
 * its own baseline rather than with the game's current price alone.
 *
 * `null` means "this game has no price the card could print", which is the state a
 * card is posted in when the slate goes out before the odds do. Absent to absent is
 * no change, and either direction between absent and present is a change: that is
 * the fill-in the sweep exists for, and the same rule covers a price that is
 * dropped from the feed entirely.
 */
export function sameStake(then: CardStake | null, now: CardStake | null): boolean {
  if (then === null || now === null) return then === now;

  return then.home === now.home && then.away === now.away;
}
