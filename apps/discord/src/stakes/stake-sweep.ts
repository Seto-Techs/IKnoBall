import type { SweepJob, SweepSource } from '../lock/card-sweep';
import type { CardSweepRepository } from '../lock/sweep-repository';

/**
 * The points-refresh sweep: an open card whose payout is missing or out of date.
 *
 * A slate goes out on a timer, so the first card of a game is often posted before
 * the feed has a price for it — the card renders without its "+N pts" line, and
 * nothing brought it back. This sweep is what does: every minute it looks at the
 * cards that are still open, compares the price that would be printed now with the
 * price the card was last written from, and rebuilds the ones that disagree.
 *
 * Idempotency is the same trick the other two sweeps use, one level up: the lock
 * sweep stamps `lockedAt`, this one stamps `updatedAt`, and `dueForStakes` reads it
 * back as the baseline. A card edited for its points is therefore not due again
 * until the line actually moves — the worker's five-minute captures do not each buy
 * a PATCH.
 *
 * The predicate lives in the shared repository with the others, because all three
 * sweeps read the same card, game, and team rows; only the window, the comparison,
 * and the stamp differ.
 */
export class StakeSweep implements SweepSource {
  readonly name = 'stake refresh';

  constructor(private readonly repository: CardSweepRepository) {}

  due(now: Date, limit: number, excludeIds: readonly string[]): Promise<SweepJob[]> {
    // Before tip-off only: past it the card is locked and the payout is noise, and
    // the lock sweep owns that card. A sibling that has tipped off since the post
    // still comes back locked in the rebuilt payload, exactly as it looks now.
    return this.repository.dueForStakes(now, limit, excludeIds);
  }

  record(cardIds: readonly string[], at: Date): Promise<void> {
    return this.repository.markStakes(cardIds, at);
  }
}
