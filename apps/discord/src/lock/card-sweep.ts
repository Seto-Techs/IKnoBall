import type { CardPayload } from '../cards/card-payload';
import { classifyEditFailure } from './card-edit';
import type { CardEditor } from './card-editor';
import type { DeadCards } from './dead-cards';

/**
 * One *message* that is due an edit, with the exact payload Discord will receive.
 *
 * The unit of work is the message, not the card, because
 * `PATCH /channels/{c}/messages/{m}` replaces the whole payload: editing "one
 * card" means rebuilding the message with that card changed and everything else it
 * holds as it should look — a per-card edit would delete the rest. A card is its
 * own message now (DISC-10), so a job normally holds a single card; messages posted
 * before that change still hold four, and rebuilding them from their rows leaves
 * them exactly as they were.
 */
export interface SweepJob {
  channelId: string;
  messageId: string;
  /** The cards this run is responsible for stamping in that message. */
  cardIds: string[];
  payload: CardPayload;
}

/**
 * What a sweep needs from the database.
 *
 * A port rather than a Drizzle client so the loop can be tested against a table
 * that lives in memory. `due` is where the "already edited" filter lives — the
 * real one is `lockedAt is null` / `settledAt is null` in SQL — so a second run
 * over an already-recorded card returns nothing, which is what makes the sweep
 * idempotent.
 */
export interface SweepSource {
  /** For logs: 'tip-off lock' or 'settlement'. */
  readonly name: string;
  due(now: Date, limit: number, excludeIds: readonly string[]): Promise<SweepJob[]>;
  /** Stamp the cards so the next run cannot select them again. */
  record(cardIds: readonly string[], at: Date): Promise<void>;
}

export interface SweepReport {
  /** True when the run did nothing at all: not ready, already running, or backing off. */
  skipped: boolean;
  /** Cards that were due. */
  candidates: number;
  /** Messages edited: one REST call each. */
  messages: number;
  /** Cards stamped, which is `candidates` minus the dead and the failed. */
  edited: number;
  dead: number;
  /** Transient failures. Any value above zero aborts the run and starts a backoff. */
  failed: number;
}

/** The subset of Nest's `Logger` a sweep uses. */
export interface SweepLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface CardSweepOptions {
  source: SweepSource;
  editor: CardEditor;
  deadCards: DeadCards;
  logger: SweepLogger;
  /** Injected so a test can move the clock instead of waiting a minute. */
  now?: () => Date;
  /** Cards per run. Both sweeps run every minute, so this is a ceiling, not a batch size. */
  limit?: number;
  /**
   * One outbound Discord call. The default runs it straight through; the bot
   * passes `RateLimiter.schedule` so DISC-12's single REST queue owns the pacing
   * of a settlement burst without this file changing.
   */
  pace?: <T>(task: () => Promise<T>) => Promise<T>;
  /** First pause after a transient failure. Doubles per consecutive failure. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_BACKOFF_BASE_MS = 60_000;
const DEFAULT_BACKOFF_MAX_MS = 900_000;

/**
 * The loop both card sweeps share: find due cards, edit each one, stamp it.
 *
 * Three properties it is built for, in order of importance:
 *
 * 1. **One broken card never stops the sweep.** A 403, a deleted message, or a
 *    channel the bot was removed from marks that card dead and the loop continues
 *    to its siblings. A card that cannot be edited is not the schedule's problem.
 * 2. **A Discord outage does not become a retry loop.** The first *transient*
 *    failure ends the run and sets a backoff that doubles up to 15 minutes, so a
 *    Discord that is down is asked once per window instead of once per card per
 *    minute. Ten thousand invalid requests per ten minutes is a temporary
 *    Cloudflare ban, and that is the failure mode this avoids.
 * 3. **A run never overlaps itself.** The minute cron and a slow run would
 *    otherwise both edit the same card.
 *
 * It never throws: a sweep is a background job, and an exception here would be an
 * unhandled rejection in the scheduler rather than anything a user can see.
 */
export class CardSweep {
  private readonly source: SweepSource;
  private readonly editor: CardEditor;
  private readonly deadCards: DeadCards;
  private readonly logger: SweepLogger;
  private readonly now: () => Date;
  private readonly limit: number;
  private readonly pace: <T>(task: () => Promise<T>) => Promise<T>;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private running = false;
  private failures = 0;
  /** Epoch ms before which no run may start. */
  private backoffUntil = 0;

  constructor(options: CardSweepOptions) {
    this.source = options.source;
    this.editor = options.editor;
    this.deadCards = options.deadCards;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.limit = options.limit ?? DEFAULT_LIMIT;
    this.pace = options.pace ?? ((task) => task());
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  }

  async run(): Promise<SweepReport> {
    const idle = (): SweepReport => ({
      skipped: true,
      candidates: 0,
      messages: 0,
      edited: 0,
      dead: 0,
      failed: 0,
    });

    if (this.running) {
      this.logger.warn(`${this.source.name}: previous run is still in flight, skipping.`);
      return idle();
    }

    const now = this.now();

    if (now.getTime() < this.backoffUntil) {
      return idle();
    }

    if (!this.editor.ready()) {
      this.logger.warn(`${this.source.name}: Discord is not ready, skipping this run.`);
      return idle();
    }

    // Set before the first await: a cron tick that arrives mid-run must see it.
    this.running = true;

    let jobs: SweepJob[];
    try {
      jobs = await this.source.due(now, this.limit, this.deadCards.ids());
    } catch (error) {
      this.running = false;
      this.fail(this.source.name, `could not select due cards`, error, now);
      return { skipped: false, candidates: 0, messages: 0, edited: 0, dead: 0, failed: 1 };
    }

    const candidates = jobs.reduce((total, job) => total + job.cardIds.length, 0);

    let messages = 0;
    let edited = 0;
    let dead = 0;
    let failed = 0;

    try {
      for (const job of jobs) {
        // The query already excludes dead cards; this is the belt to its braces,
        // and it matters more than it looks: deadness is a property of the
        // *message*, because that is what the failed edit was about, so one known
        // dead card in the group means the whole message is dead and retrying it
        // would only repeat the failure.
        if (job.cardIds.some((cardId) => this.deadCards.has(cardId))) continue;

        try {
          await this.pace(() => this.editor.editCard(job, job.payload));
          await this.source.record(job.cardIds, now);
          messages += 1;
          edited += job.cardIds.length;
        } catch (error) {
          if (classifyEditFailure(error) === 'dead') {
            for (const cardId of job.cardIds) this.deadCards.add(cardId);
            dead += job.cardIds.length;
            this.logger.warn(
              `${this.source.name}: message ${job.messageId} in channel ${job.channelId} is dead, dropping ${job.cardIds.length} card(s): ${describe(error)}`,
            );
            continue;
          }

          // Transient: Discord is probably down, and the remaining messages would
          // fail the same way. Stop the run rather than repeat the failure.
          failed += 1;
          this.fail(this.source.name, `edit of message ${job.messageId} failed`, error, now);
          break;
        }
      }
    } finally {
      this.running = false;
    }

    // Only a run that never failed clears the backoff, so a flapping Discord
    // still lengthens the pause instead of resetting it every minute.
    if (failed === 0) this.failures = 0;

    if (messages > 0 || dead > 0) {
      this.logger.log(
        `${this.source.name}: edited ${edited} card(s) in ${messages} message(s), dead ${dead}, candidates ${candidates}.`,
      );
    }

    return { skipped: false, candidates, messages, edited, dead, failed };
  }

  /** Record a failure and lengthen the pause before the next attempt. */
  private fail(name: string, what: string, error: unknown, now: Date): void {
    this.failures += 1;
    const delay = Math.min(this.backoffBaseMs * 2 ** (this.failures - 1), this.backoffMaxMs);
    this.backoffUntil = now.getTime() + delay;
    this.logger.error(
      `${name}: ${what}, pausing for ${Math.round(delay / 1000)}s (failure ${this.failures}): ${describe(error)}`,
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
