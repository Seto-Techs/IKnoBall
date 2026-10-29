import { Logger } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis/redis.service';

/**
 * Per-user throttle for `POST /internal/predictions`.
 *
 * A Discord card has two buttons and a click is cheap to repeat: a script (or an
 * impatient user) can send far more writes than the database should see. The
 * window is per `userId`, not per IP, because the bot is a single caller and the
 * identity that matters is whose picks are being written.
 *
 * Redis, not memory: the API may run more than one instance, and a per-process
 * counter would multiply the budget by the replica count. `RedisModule` is
 * global, so `RedisService` needs no new wiring.
 */

/** Attempts one user may make inside one window. */
export const PICK_THROTTLE_LIMIT = 10;

/** Window length, in seconds. */
export const PICK_THROTTLE_WINDOW_SECONDS = 60;

const KEY_PREFIX = 'internal:pick-throttle:';
const logger = new Logger('PickThrottle');

export interface ThrottleDecision {
  allowed: boolean;
  /** Seconds until the window frees up. Zero when the attempt is allowed. */
  retryAfterSeconds: number;
}

/**
 * Count one attempt and say whether it may proceed.
 *
 * `INCR` then `EXPIRE ... NX`: the first attempt in a window sets the expiry and
 * every later one leaves it alone, so a steady stream of clicks cannot keep
 * pushing the reset out. Counting attempts rather than successes is deliberate —
 * a rejected pick still costs a round trip.
 *
 * Fails open when Redis is unreachable. The tip-off check and the database are
 * the authority on whether a pick may be written, so a cache outage must not stop
 * picks altogether; it is logged every time because a silent outage means no
 * throttle at all.
 */
export async function consumePickBudget(
  redis: RedisService,
  userId: string,
  limit: number = PICK_THROTTLE_LIMIT,
  windowSeconds: number = PICK_THROTTLE_WINDOW_SECONDS,
): Promise<ThrottleDecision> {
  const key = `${KEY_PREFIX}${userId}`;

  try {
    if (!redis.isConnected()) await redis.connect();
    const client = redis.getClient();

    const count = await client.incr(key);
    await client.expire(key, windowSeconds, 'NX');

    if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };

    const ttl = await client.ttl(key);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  } catch (error) {
    logger.warn(
      `Redis unavailable, allowing pick attempt: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
