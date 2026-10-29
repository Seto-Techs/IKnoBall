/**
 * Cards whose edit will never land.
 *
 * `discord_cards` has no column for this, and adding one belongs to the chunk
 * that owns `packages/database`, so the bot remembers the ids in process. The
 * consequences are worth stating plainly:
 *
 * - A restart forgets the set, so each dead card costs exactly one failed REST
 *   call per process lifetime, and is then skipped. That is bounded and cheap.
 * - Until a column exists, a dead card is still selected by the sweeps' SQL
 *   (`lockedAt is null`), which is why the sweeps pass these ids into the query as
 *   an exclusion list instead of filtering the result in memory — a page full of
 *   dead cards must not starve live ones.
 */
export class DeadCards {
  /** Bounded so the exclusion list stays a sane size in a single query. */
  private static readonly LIMIT = 1_000;

  private readonly set = new Set<string>();

  has(cardId: string): boolean {
    return this.set.has(cardId);
  }

  add(cardId: string): void {
    if (this.set.size < DeadCards.LIMIT) this.set.add(cardId);
  }

  get size(): number {
    return this.set.size;
  }

  /** The exclusion list for the next query. */
  ids(): string[] {
    return [...this.set];
  }
}

/**
 * One set for the whole process.
 *
 * Both sweeps must agree on what is dead: a card whose channel is gone is gone for
 * the lock sweep and for the settlement sweep alike, and marking it twice would
 * mean two failed REST calls per run.
 */
export const deadCards = new DeadCards();
