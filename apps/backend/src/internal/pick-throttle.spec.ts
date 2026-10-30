import { describe, expect, it } from 'vitest';
import type { RedisService } from '../infrastructure/redis/redis.service';
import {
  consumePickBudget,
  PICK_THROTTLE_WINDOW_SECONDS,
  type ThrottleDecision,
} from './pick-throttle';

/**
 * Redis counters with a clock the test moves by hand.
 *
 * Expiry is modelled the way Redis behaves: an expired key is gone, so the next
 * `INCR` starts again at 1, and `EXPIRE ... NX` only sets an expiry when the key
 * does not already have one.
 */
class ClockedRedis {
  now = 1_000_000;
  failing = false;
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  isConnected(): boolean {
    return true;
  }

  async connect(): Promise<void> {}

  getClient() {
    return {
      incr: async (key: string) => {
        if (this.failing) throw new Error('ECONNREFUSED');
        const live = this.live(key);
        const count = (live?.count ?? 0) + 1;
        this.counters.set(key, { count, expiresAt: live?.expiresAt ?? 0 });
        return count;
      },
      expire: async (key: string, seconds: number, mode?: string) => {
        const live = this.live(key);
        if (!live) return 0;
        if (mode === 'NX' && live.expiresAt > this.now) return 0;
        live.expiresAt = this.now + seconds * 1000;
        return 1;
      },
      ttl: async (key: string) => {
        const live = this.live(key);
        if (!live) return -2;
        if (live.expiresAt === 0) return -1;
        return Math.max(0, Math.ceil((live.expiresAt - this.now) / 1000));
      },
    };
  }

  private live(key: string) {
    const entry = this.counters.get(key);
    if (!entry) return undefined;
    // `expiresAt === 0` is "no expiry set yet", not "expired".
    if (entry.expiresAt !== 0 && entry.expiresAt <= this.now) {
      this.counters.delete(key);
      return undefined;
    }
    return entry;
  }
}

const redis = () => new ClockedRedis() as unknown as RedisService;

describe('consumePickBudget', () => {
  it('allows the budget and refuses the next attempt in the same window', async () => {
    const client = redis();
    const decisions: ThrottleDecision[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      decisions.push(await consumePickBudget(client, 'user_1', 3, 60));
    }

    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3].retryAfterSeconds).toBe(60);
  });

  it('reports the remaining window, not a fresh one, on a refusal', async () => {
    const client = redis();
    for (let attempt = 0; attempt < 2; attempt++) await consumePickBudget(client, 'user_1', 1, 60);

    // Half the window has gone by.
    (client as unknown as ClockedRedis).now += 30_000;

    const refused = await consumePickBudget(client, 'user_1', 1, 60);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(30);
  });

  it('frees the budget when the window expires', async () => {
    const client = redis();
    expect((await consumePickBudget(client, 'user_1', 1)).allowed).toBe(true);
    expect((await consumePickBudget(client, 'user_1', 1)).allowed).toBe(false);

    (client as unknown as ClockedRedis).now += PICK_THROTTLE_WINDOW_SECONDS * 1000;

    expect((await consumePickBudget(client, 'user_1', 1)).allowed).toBe(true);
  });

  it('counts each user separately', async () => {
    const client = redis();
    expect((await consumePickBudget(client, 'user_1', 1)).allowed).toBe(true);
    expect((await consumePickBudget(client, 'user_1', 1)).allowed).toBe(false);
    expect((await consumePickBudget(client, 'user_2', 1)).allowed).toBe(true);
  });

  it('fails open when Redis is unreachable', async () => {
    const client = redis();
    (client as unknown as ClockedRedis).failing = true;

    const decision = await consumePickBudget(client, 'user_1', 1);

    expect(decision).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});
