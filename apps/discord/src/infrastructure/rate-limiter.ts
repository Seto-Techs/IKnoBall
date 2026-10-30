/**
 * One queue for every outbound Discord REST call (DISC-12).
 *
 * Discord publishes three numbers that matter: 50 requests per second per bot,
 * per-route buckets that are only discoverable from response headers, and a
 * Cloudflare ban after 10,000 invalid requests in ten minutes — invalid being a
 * 401, a 403, or a 429. A 404 is not on Discord's list, but a message that is gone
 * is as dead as one the bot may not touch, so this queue counts it too.
 * The queue below is built against all three:
 *
 * 1. **A global token bucket under 50/s.** 40 requests a second with a burst of 5
 *    allows at most 45 requests in *any* one-second window (`burst + rate`), so a
 *    window boundary cannot push it over 50. The headroom is not caution for its
 *    own sake: interaction callbacks and any discord.js call a future chunk makes
 *    outside `schedule()` spend from the same 50.
 * 2. **Per-route awareness.** `X-RateLimit-Bucket`, `X-RateLimit-Remaining` and
 *    `X-RateLimit-Reset-After` are folded into a bucket table keyed the way Discord
 *    keys it — bucket hash plus major parameter — and a task whose bucket is empty
 *    waits for that bucket's reset instead of spending a 429 to find out. In
 *    production the headers arrive from discord.js's own REST emitter
 *    (`attachRest`); a transport that speaks HTTP directly can report them with
 *    `observe()`.
 * 3. **`retry_after` instead of a fixed delay.** A 429 is waited out for exactly as
 *    long as Discord asked and the task is retried, so a rate limit never surfaces
 *    as a failed card edit. A 401 halts the queue: a bad token cannot recover by
 *    retrying, and each retry is another invalid request.
 *
 * It is a *queue*, not a semaphore: tasks leave in arrival order, and the only
 * thing that ever holds one back is the bucket it belongs to. Everything that
 * posts or edits goes through `schedule()`, so the pacing of a 100-guild fan-out
 * is decided here and nowhere else.
 *
 * Measured costs, the 100-guild load test, and the per-card-versus-follow-up
 * question live in `docs/discord-rate-limits.md`.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { REST } from 'discord.js';
import { classifyEditFailure } from '../lock/card-edit';

/** A Discord route as this queue keys it, e.g. `POST /channels/123/messages`. */
export type RouteKey = string;

/**
 * One outbound call, paced by the shared queue.
 *
 * The route is optional so `lock/card-sweep.ts`'s `pace` option — which takes a
 * bare task — still fits: a call with no route is only bounded by the global
 * bucket, which is exactly what discord.js's own per-route queue already handles
 * for its calls.
 */
export type Pace = <T>(task: () => Promise<T>, route?: RouteKey) => Promise<T>;

export interface RateLimitStats {
  /** Attempts handed to Discord, including the ones it answered with a 429. */
  sent: number;
  /** 429s: ours, plus the ones discord.js absorbed before they reached us. */
  rateLimited: number;
  /**
   * 401, 403 and 404 responses. Discord's own ban counts 401/403/429; a 404 is
   * counted here too, because a dead card is dead either way.
   */
  invalid: number;
  /** Attempts that were a retry of an earlier 429. */
  retries: number;
  /** The longest single pause the queue imposed, in milliseconds. */
  longestWaitMs: number;
  /** Tasks waiting for a token. */
  queued: number;
  /** Tasks inside `task()`. */
  inFlight: number;
  /** True after a 401: every call now fails fast without touching Discord. */
  halted: boolean;
}

/** The slice of Nest's `Logger` this queue uses. */
export interface RateLimitLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface RateLimiterOptions {
  /** Sustained requests per second. Default 40: 10 under Discord's 50. */
  perSecond?: number;
  /** Tokens available at once. Default 5, so `burst + perSecond` stays under 50. */
  burst?: number;
  /** How many times a 429 is waited out before the error is surfaced. */
  maxRetries?: number;
  /** Injected so a test can run on a virtual clock. */
  now?: () => number;
  /** Injected so a test can run on a virtual clock. */
  sleep?: (ms: number) => Promise<void>;
  logger?: RateLimitLogger;
}

/** Thrown once the queue is halted by a 401, and to every task still queued. */
export class DiscordAuthError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = 'DiscordAuthError';
  }
}

interface Job {
  route?: RouteKey;
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/** One Discord rate-limit bucket: a hash plus a major parameter, as Discord keys it. */
interface BucketState {
  limit: number | null;
  remaining: number;
  /** Epoch ms at which `remaining` goes back to `limit`. */
  resetAt: number;
}

/** Anything that can answer `get('x-ratelimit-bucket')`: `Headers` or a plain object. */
export type HeaderBag =
  | { get(name: string): string | null }
  | Record<string, string | null | undefined>;

const DEFAULT_PER_SECOND = 40;
const DEFAULT_BURST = 5;
const DEFAULT_MAX_RETRIES = 3;

/** Snowflakes: the only ids Discord routes carry. */
const SNOWFLAKE = /\d{16,20}/g;

/**
 * `PATCH /channels/123…/messages/456…` → `PATCH /channels/:id/messages/:id`.
 *
 * The route *shape* is what stays stable across messages; the channel id is
 * Discord's major parameter and is kept separate, because a bucket is per
 * (shape, channel) and not per message.
 */
export function routeFamily(route: RouteKey): string {
  return route.replace(SNOWFLAKE, ':id');
}

/** Discord's major parameter: the channel a request is about, else `global`. */
function majorParameter(route: RouteKey): string {
  return /\/channels\/(\d{16,20})/.exec(route)?.[1] ?? 'global';
}

function headerValue(headers: HeaderBag | undefined, name: string): string | null {
  if (!headers) return null;
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    return (getter as (key: string) => string | null).call(headers, name) ?? null;
  }
  const record = headers as Record<string, string | null | undefined>;
  return record[name] ?? record[name.toLowerCase()] ?? null;
}

function numberValue(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function numericField(value: unknown, key: string): number | null {
  const raw = field(value, key);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function statusOf(error: unknown): number | null {
  return numericField(error, 'status') ?? numericField(field(error, 'rawError'), 'status');
}

/**
 * How long a 429 asked us to wait, in milliseconds, or `null` if it was not a 429.
 *
 * Three shapes reach this queue and all three are honoured: discord.js's
 * `RateLimitError` (`retryAfter`, already in ms), Discord's JSON body
 * (`retry_after`, in seconds, under `rawError` or at the top level), and a bare
 * `Retry-After` header (seconds). Anything else that looks like a 429 gets one
 * second rather than a fixed retry cadence, and a 429 with no body at all is still
 * waited out rather than surfaced.
 */
function rateLimitWait(error: unknown): number | null {
  const status = statusOf(error);
  const fromDiscordJs = numericField(error, 'retryAfter');
  const fromBody = numericField(field(error, 'rawError'), 'retry_after');
  const fromTopLevel = numericField(error, 'retry_after');
  const fromHeader = numberValue(headerValue(field(error, 'headers') as HeaderBag, 'retry-after'));

  if (status !== 429 && fromDiscordJs === null && fromBody === null && fromTopLevel === null) {
    return null;
  }

  if (fromDiscordJs !== null) return Math.max(0, fromDiscordJs);
  const seconds = fromBody ?? fromTopLevel ?? fromHeader;
  return seconds === null ? 1_000 : Math.max(0, seconds * 1_000);
}

/** True when a 429 told us the *global* bucket is empty, not just one route's. */
function isGlobalRateLimit(error: unknown): boolean {
  return field(error, 'global') === true || field(field(error, 'rawError'), 'global') === true;
}

@Injectable()
export class RateLimiter {
  private readonly logger: RateLimitLogger = new Logger(RateLimiter.name);

  private readonly perSecond: number;
  private readonly burst: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private tokens: number;
  private lastRefill: number;
  /** Epoch ms before which nothing at all may be sent (a global 429). */
  private globalUntil = 0;

  /** Buckets keyed `hash:majorParameter`, or `family|major` before a hash is known. */
  private readonly buckets = new Map<string, BucketState>();
  /** Route family to the bucket key a response revealed for it. */
  private readonly routeKeys = new Map<string, string>();

  private readonly queue: Job[] = [];
  private draining = false;
  private restAttached = false;

  private sent = 0;
  private rateLimited = 0;
  private invalid = 0;
  private retries = 0;
  private longestWaitMs = 0;
  private inFlight = 0;
  private halted = false;

  constructor(@Optional() options?: RateLimiterOptions) {
    this.perSecond = options?.perSecond ?? DEFAULT_PER_SECOND;
    this.burst = options?.burst ?? DEFAULT_BURST;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.now = options?.now ?? (() => Date.now());
    this.sleep = options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    if (options?.logger) this.logger = options.logger;

    this.tokens = this.burst;
    this.lastRefill = this.now();
  }

  /**
   * Run one Discord call, in queue order, under the shared budget.
   *
   * The signature is the one every call site already uses (`schedule(task)`), so
   * routing a send through the queue is a one-line change; the optional route is
   * what lets the per-route table hold a call back before it spends a 429.
   */
  schedule<T>(task: () => Promise<T>, route?: RouteKey): Promise<T> {
    if (this.halted) return Promise.reject(this.authError());

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        route,
        task,
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.pump();
    });
  }

  /** Tasks queued or in flight. `/status` reads this (DISC-14). */
  depth(): number {
    return this.queue.length + this.inFlight;
  }

  stats(): RateLimitStats {
    return {
      sent: this.sent,
      rateLimited: this.rateLimited,
      invalid: this.invalid,
      retries: this.retries,
      longestWaitMs: this.longestWaitMs,
      queued: this.queue.length,
      inFlight: this.inFlight,
      halted: this.halted,
    };
  }

  /**
   * Feed one response's rate-limit headers into the bucket table.
   *
   * Called by discord.js's REST emitter in the bot, and directly by any transport
   * that speaks HTTP itself (the load test does). A response with no
   * `X-RateLimit-Remaining` leaves the bucket as it was.
   */
  observe(route: RouteKey, headers: HeaderBag | undefined): void {
    if (!headers) return;

    const now = this.now();
    const hash = headerValue(headers, 'x-ratelimit-bucket');
    const family = this.familyKey(route);
    const key = hash ? `${hash}:${majorParameter(route)}` : family;
    if (hash) this.routeKeys.set(family, key);

    const remaining = numberValue(headerValue(headers, 'x-ratelimit-remaining'));
    const resetAfter = numberValue(headerValue(headers, 'x-ratelimit-reset-after'));
    const limit = numberValue(headerValue(headers, 'x-ratelimit-limit'));

    const bucket = this.bucket(key);
    if (limit !== null) bucket.limit = limit;
    if (remaining !== null) bucket.remaining = remaining;
    if (resetAfter !== null) bucket.resetAt = now + resetAfter * 1_000;

    if (headerValue(headers, 'x-ratelimit-global') === 'true' && resetAfter !== null) {
      this.globalUntil = Math.max(this.globalUntil, now + resetAfter * 1_000);
    }
  }

  /**
   * Listen to discord.js's REST layer: the only place the real headers appear.
   *
   * Without this the queue would be blind to per-route state in production —
   * discord.js answers its own 429s and retries internally, so a `schedule()` task
   * usually sees a success and never learns the bucket was empty. The
   * `rateLimited` event is the signal, and `invalidRequestWarning` is the ban
   * counter Discord itself watches.
   */
  attachRest(rest: REST): void {
    if (this.restAttached) return;
    this.restAttached = true;

    rest.on('response', (request, response) => {
      this.observe(`${request.method} ${request.path}`, response.headers as HeaderBag);
    });

    rest.on('rateLimited', (info) => {
      this.rateLimited += 1;
      this.noteWait(info.retryAfter);
      if (info.global) {
        this.globalUntil = Math.max(this.globalUntil, this.now() + info.retryAfter);
      } else {
        this.blockBucket(`${info.hash}:${info.majorParameter}`, info.retryAfter);
      }
      this.logger.warn(
        `Discord REST: rate limited on ${info.method} ${info.route} (${info.scope}), waiting ${Math.round(info.retryAfter)}ms.`,
      );
    });

    rest.on('invalidRequestWarning', (info) => {
      this.logger.error(
        `Discord REST: ${info.count} invalid requests in the current window, resetting in ${Math.round(info.remainingTime / 1_000)}s. 10,000 in ten minutes is a temporary ban.`,
      );
    });
  }

  // ------------------------------------------------------------------ dispatch

  private pump(): void {
    if (this.draining) return;
    this.draining = true;

    void this.drain().finally(() => {
      this.draining = false;
      // A task that arrived while the last iteration was unwinding still needs a
      // dispatcher; nothing else would ever start it.
      if (this.queue.length > 0) this.pump();
    });
  }

  /**
   * Hand out tokens until the queue is empty.
   *
   * One dispatcher, not one timer per task: the order tasks leave in is the order
   * they arrived in, minus the ones whose own route bucket is empty (a blocked
   * route must not stop the other ninety-nine guilds).
   */
  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      if (this.halted) return;

      const now = this.now();
      const globalWait = this.globalWait(now);
      const index = globalWait > 0 ? -1 : this.queue.findIndex((job) => this.routeReady(job, now));

      if (index === -1) {
        const wait = globalWait > 0 ? globalWait : this.nextRouteReset(now) - now;
        this.noteWait(wait);
        await this.sleep(Math.max(1, Math.ceil(wait)));
        continue;
      }

      const [job] = this.queue.splice(index, 1);
      this.spend(now);
      void this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    this.inFlight += 1;
    try {
      job.resolve(await this.attempt(job));
    } catch (error) {
      job.reject(error);
    } finally {
      this.inFlight -= 1;
    }
  }

  /** One task, retried for as long as Discord keeps saying 429. */
  private async attempt(job: Job): Promise<unknown> {
    for (let tries = 0; ; tries += 1) {
      try {
        this.sent += 1;
        return await job.task();
      } catch (error) {
        const wait = rateLimitWait(error);

        if (wait !== null) {
          this.rateLimited += 1;
          if (tries >= this.maxRetries) throw error;

          this.retries += 1;
          this.afterRateLimit(job.route, error, wait);
          this.noteWait(wait);
          this.logger.warn(
            `Discord REST: 429 on ${job.route ?? 'an unlabelled call'}, retrying in ${Math.round(wait)}ms (attempt ${tries + 2}).`,
          );
          await this.sleep(wait);
          continue;
        }

        if (statusOf(error) === 401) {
          this.invalid += 1;
          this.halt();
          throw this.authError();
        }

        // 403 and 404 are a property of the destination, not of the moment: the
        // sweep already treats them as a dead card, and retrying one is exactly
        // the invalid request the ban counts. Everything else is transient and
        // belongs to the caller's backoff, not to this queue.
        if (classifyEditFailure(error) === 'dead') this.invalid += 1;
        throw error;
      }
    }
  }

  private afterRateLimit(route: RouteKey | undefined, error: unknown, waitMs: number): void {
    if (isGlobalRateLimit(error)) {
      this.globalUntil = Math.max(this.globalUntil, this.now() + waitMs);
      return;
    }
    if (route) this.blockBucket(this.keyFor(route), waitMs);
  }

  /** Nothing leaves the queue after a 401: every further call is another invalid request. */
  private halt(): void {
    if (this.halted) return;
    this.halted = true;
    this.logger.error(
      'Discord REST: 401 from Discord. Halting every outbound request in this process — a rejected token cannot recover by retrying, and 10,000 invalid requests in ten minutes earns a temporary ban. Restart with a valid token.',
    );
    for (const job of this.queue.splice(0)) job.reject(this.authError());
  }

  private authError(): DiscordAuthError {
    return new DiscordAuthError(
      'Discord rejected the bot token (401); outbound REST is halted until this process restarts.',
    );
  }

  // ------------------------------------------------------------- the buckets

  private familyKey(route: RouteKey): string {
    return `${routeFamily(route)}|${majorParameter(route)}`;
  }

  private keyFor(route: RouteKey): string {
    const family = this.familyKey(route);
    return this.routeKeys.get(family) ?? family;
  }

  private bucket(key: string): BucketState {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { limit: null, remaining: 1, resetAt: 0 };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private blockBucket(key: string, waitMs: number): void {
    const bucket = this.bucket(key);
    bucket.remaining = 0;
    bucket.resetAt = Math.max(bucket.resetAt, this.now() + waitMs);
  }

  private routeReady(job: Job, now: number): boolean {
    if (!job.route) return true;
    const bucket = this.buckets.get(this.keyFor(job.route));
    if (!bucket) return true;
    return bucket.remaining > 0 || now >= bucket.resetAt;
  }

  /** When the first still-blocked route in the queue frees up. */
  private nextRouteReset(now: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const job of this.queue) {
      if (!job.route) return now;
      const bucket = this.buckets.get(this.keyFor(job.route));
      if (bucket && bucket.remaining <= 0) earliest = Math.min(earliest, bucket.resetAt);
    }
    return Number.isFinite(earliest) ? earliest : now + 1;
  }

  private globalWait(now: number): number {
    if (now < this.globalUntil) return this.globalUntil - now;
    this.refill(now);
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) * 1_000) / this.perSecond);
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.lastRefill);
    this.lastRefill = now;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.perSecond) / 1_000);
  }

  private spend(now: number): void {
    this.refill(now);
    this.tokens -= 1;
  }

  private noteWait(ms: number): void {
    if (ms > this.longestWaitMs) this.longestWaitMs = Math.round(ms);
  }
}
