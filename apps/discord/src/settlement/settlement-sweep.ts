import type { SweepJob, SweepSource } from '../lock/card-sweep';
import type { CardSweepRepository } from '../lock/sweep-repository';

/**
 * The settlement sweep's view of the database: cards whose game is final and which
 * have not been edited with the result yet (DISC-11).
 *
 * `record` stamps `settledAt`, so a game that stays final for days is edited once.
 * The join lives in the shared repository because both sweeps read the same card,
 * game, and team rows; only the predicate and the payload differ.
 */
export class SettlementSweep implements SweepSource {
  readonly name = 'settlement';

  constructor(private readonly repository: CardSweepRepository) {}

  due(now: Date, limit: number, excludeIds: readonly string[]): Promise<SweepJob[]> {
    // `gameStatus` is the feed's own answer to "is this final", so the clock only
    // decides how the message's *other* cards render: a sibling that has tipped off
    // since it was posted comes back locked, exactly as the lock sweep would leave
    // it, and a sibling already final comes back settled.
    return this.repository.dueForSettlement(now, limit, excludeIds);
  }

  record(cardIds: readonly string[], at: Date): Promise<void> {
    return this.repository.markSettled(cardIds, at);
  }
}
