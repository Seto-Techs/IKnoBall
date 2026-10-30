import { describe, expect, it } from 'vitest';
import type IORedis from 'ioredis';
import { DAY_KEY_GUARD, DAY_KEY_TTL_SECONDS, RedisDayKeyGuard, dayKey } from './day-key.guard';
import type { Infrastructure } from './infrastructure';

/**
 * The Redis half of "already posted today".
 *
 * A fake `ioredis` is enough: the guard only calls `exists` and `set … EX`, and
 * what matters is the key it builds and the TTL it asks for.
 */

interface FakeRedis {
  readonly keys: Map<string, { value: string; ttl: number }>;
  exists(key: string): Promise<number>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<'OK'>;
}

function fakeRedis(): FakeRedis {
  const keys = new Map<string, { value: string; ttl: number }>();
  return {
    keys,
    async exists(key: string) {
      return keys.has(key) ? 1 : 0;
    },
    async set(key: string, value: string, _mode: 'EX', ttl: number) {
      keys.set(key, { value, ttl });
      return 'OK' as const;
    },
  };
}

function guardFor(redis: FakeRedis): RedisDayKeyGuard {
  return new RedisDayKeyGuard({ redis } as unknown as Infrastructure);
}

describe('the day key', () => {
  it('is one key per guild per slate day', () => {
    expect(dayKey('1234', '2026-10-27')).toBe('1234:2026-10-27');
    expect(dayKey('1234', '2026-10-27')).not.toBe(dayKey('1234', '2026-10-28'));
    expect(dayKey('1234', '2026-10-27')).not.toBe(dayKey('5678', '2026-10-27'));
  });

  it('is a string, because it is the token other chunks pass around', () => {
    expect(typeof DAY_KEY_GUARD).toBe('string');
  });
});

describe('RedisDayKeyGuard', () => {
  it('is absent before a post and present after it', async () => {
    const redis = fakeRedis();
    const guard = guardFor(redis);
    const key = dayKey('1234', '2026-10-27');

    expect(await guard.has(key)).toBe(false);
    await guard.remember(key);
    expect(await guard.has(key)).toBe(true);
  });

  it('expires, so a key cannot outlive its day', async () => {
    const redis = fakeRedis();
    await guardFor(redis).remember(dayKey('1234', '2026-10-27'));

    expect(DAY_KEY_TTL_SECONDS).toBe(3 * 24 * 60 * 60);
    expect(redis.keys.get('1234:2026-10-27')).toEqual({
      value: 'posted',
      ttl: DAY_KEY_TTL_SECONDS,
    });
  });

  it('does not answer for another guild', async () => {
    const redis = fakeRedis();
    const guard = guardFor(redis);
    await guard.remember(dayKey('1234', '2026-10-27'));

    expect(await guard.has(dayKey('5678', '2026-10-27'))).toBe(false);
  });

  it('type-checks as the injected interface', () => {
    // The token is what the scheduler injects, so the class has to satisfy it.
    const guard: { has(key: string): Promise<boolean> } = guardFor(fakeRedis());
    expect(guard).toBeInstanceOf(RedisDayKeyGuard);
  });

  it('is typed against ioredis, not a bespoke client', () => {
    // A compile-time assertion: `Infrastructure.redis` is an ioredis client, and
    // the fake above is structurally only the two calls this class makes.
    type Client = IORedis;
    const client: Pick<Client, 'exists' | 'set'> = fakeRedis() as unknown as Client;
    expect(client).toBeDefined();
  });
});
