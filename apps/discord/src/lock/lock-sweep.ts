import type { SweepJob, SweepSource } from './card-sweep';
import type { CardSweepRepository } from './sweep-repository';

/**
 * The tip-off lock's view of the database: cards whose game is past tip-off and
 * which have not been disabled yet (DISC-05).
 *
 * `record` stamps `lockedAt`, which is the whole idempotency story: the next run's
 * `where lockedAt is null` cannot see this card, so it is edited exactly once.
 */
export class LockSweep implements SweepSource {
  readonly name = 'tip-off lock';

  constructor(private readonly repository: CardSweepRepository) {}

  due(now: Date, limit: number, excludeIds: readonly string[]): Promise<SweepJob[]> {
    return this.repository.dueForLock(now, limit, excludeIds);
  }

  record(cardIds: readonly string[], at: Date): Promise<void> {
    return this.repository.markLocked(cardIds, at);
  }
}
