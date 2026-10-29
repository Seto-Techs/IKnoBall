import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../infrastructure/database/database.service';
import type { RedisService } from '../infrastructure/redis/redis.service';
import {
  codeKey,
  DiscordLinkService,
  generateCode,
  LINK_CODE_LENGTH,
  LINK_CODE_TTL_SECONDS,
} from './discord-link.service';

type Row = Record<string, unknown>;

/**
 * Redis with a clock the test moves by hand, and the two commands the service
 * uses: `SET key value NX EX ttl` and `GETDEL key`.
 *
 * Expiry behaves the way Redis does: an expired key is gone, so `GETDEL` returns
 * null and `SET NX` succeeds. `SET NX` returns null when the key is live, which
 * is how the service detects a collision.
 */
class FakeRedis {
  now = 1_000_000;
  /** Number of upcoming `SET NX` calls to pretend were taken by another code. */
  collisions = 0;
  private readonly keys = new Map<string, { value: string; expiresAt: number }>();

  isConnected(): boolean {
    return true;
  }

  async connect(): Promise<void> {}

  getClient() {
    return {
      set: async (key: string, value: string, options?: { EX?: number; NX?: boolean }) => {
        if (this.live(key)) {
          if (options?.NX) return null;
        }
        if (this.collisions > 0) {
          this.collisions--;
          return null;
        }
        const ttl = options?.EX ?? 0;
        this.keys.set(key, { value, expiresAt: ttl ? this.now + ttl * 1000 : 0 });
        return 'OK';
      },
      getDel: async (key: string) => {
        const live = this.live(key);
        if (!live) return null;
        this.keys.delete(key);
        return live.value;
      },
    };
  }

  /** What a key holds right now, or null once it expired or was consumed. */
  peek(key: string): string | null {
    return this.live(key)?.value ?? null;
  }

  /** Seconds left, the way `TTL` would report it. */
  ttl(key: string): number {
    const live = this.live(key);
    if (!live) return -2;
    if (live.expiresAt === 0) return -1;
    return Math.max(0, Math.ceil((live.expiresAt - this.now) / 1000));
  }

  private live(key: string) {
    const entry = this.keys.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== 0 && entry.expiresAt <= this.now) {
      this.keys.delete(key);
      return undefined;
    }
    return entry;
  }
}

interface DbDouble {
  db: unknown;
  /** Every `insert().values()` payload, in order. */
  inserted: Row[];
  /** How many `where()` calls the service made — i.e. how many queries ran. */
  queries: number;
  /** Make the next insert fail with this error, to model a unique violation. */
  failNextInsert(error: unknown): void;
}

/**
 * Minimal drizzle chain double: each `where()` consumes the next queued row set.
 *
 * The service only ever runs four shapes — `select … where … orderBy … limit`,
 * `delete … where … returning`, `delete … where`, and `insert … values` — so the
 * chain needs no column awareness; the assertions read what the service computed
 * (inserted rows, exceptions, Redis keys) rather than a fixture echo.
 */
function createDb(responses: Row[][]): DbDouble {
  let call = 0;
  let insertError: unknown = null;
  const inserted: Row[] = [];

  const settle = (rows: Row[]) => {
    const p: any = {
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
      catch: (onRejected: (error: unknown) => unknown) => Promise.resolve(rows).catch(onRejected),
      orderBy: () => p,
      limit: () => Promise.resolve(rows),
      returning: () => Promise.resolve(rows),
    };
    return p;
  };

  const chain: any = {
    select: () => chain,
    from: () => chain,
    delete: () => chain,
    insert: () => chain,
    where: () => settle(responses[call++] ?? []),
    values: (values: Row) => {
      inserted.push(values);
      if (insertError) {
        const error = insertError;
        insertError = null;
        return Promise.reject(error);
      }
      return Promise.resolve([]);
    },
  };

  const double: DbDouble = {
    db: chain,
    inserted,
    get queries() {
      return call;
    },
    failNextInsert: (error: unknown) => {
      insertError = error;
    },
  };

  return double;
}

function createService(db: DbDouble, redis: FakeRedis) {
  return new DiscordLinkService(db as unknown as DatabaseService, redis as unknown as RedisService);
}

/** A linked row in `discord_links`, as `resolve` reads it. */
const linkRow = (userId: string) => ({ userId });
/** A Better Auth sign-in row, as `resolve` reads it. */
const signInRow = (userId: string) => ({ userId });

describe('generateCode', () => {
  it('is six characters from the unambiguous alphabet', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = generateCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    }
  });

  it('does not repeat over a small sample', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('DiscordLinkService.resolve', () => {
  it('answers from the Discord sign-in row before looking at discord_links', async () => {
    const db = createDb([[signInRow('user-from-account')]]);
    const service = createService(db, new FakeRedis());

    const resolved = await service.resolve('discord-1');

    expect(resolved).toEqual({ userId: 'user-from-account', source: 'account' });
    // Only the first query ran: the link table was never consulted.
    expect(db.queries).toBe(1);
  });

  it('falls back to discord_links when there is no sign-in row', async () => {
    const db = createDb([[], [linkRow('user-from-link')]]);
    const service = createService(db, new FakeRedis());

    expect(await service.resolve('discord-2')).toEqual({
      userId: 'user-from-link',
      source: 'link',
    });
    expect(db.queries).toBe(2);
  });

  it('reports a miss as a null user, not an error', async () => {
    const db = createDb([[], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.resolve('discord-3')).toEqual({ userId: null, source: 'none' });
  });
});

describe('DiscordLinkService.issueCode', () => {
  it('stores the Discord id under a six-character key for ten minutes', async () => {
    const redis = new FakeRedis();
    const service = createService(createDb([]), redis);

    const issued = await service.issueCode('discord-1');

    expect(issued.expiresInSeconds).toBe(LINK_CODE_TTL_SECONDS);
    expect(issued.code).toHaveLength(LINK_CODE_LENGTH);
    expect(redis.peek(codeKey(issued.code))).toBe('discord-1');
    expect(redis.ttl(codeKey(issued.code))).toBe(LINK_CODE_TTL_SECONDS);
  });

  it('retries a collision instead of handing out a code that is already live', async () => {
    const redis = new FakeRedis();
    const service = createService(createDb([]), redis);
    const first = await service.issueCode('discord-1');

    // The first `SET NX` is refused as if another code already held the key.
    redis.collisions = 1;
    const second = await service.issueCode('discord-2');

    // The retry produced a code that is actually stored, for its own owner.
    expect(second.code).not.toBe(first.code);
    expect(redis.peek(codeKey(second.code))).toBe('discord-2');
    // And the first code is untouched: its owner can still spend it.
    expect(redis.peek(codeKey(first.code))).toBe('discord-1');
  });

  it('fails loudly when every attempt collides', async () => {
    const redis = new FakeRedis();
    redis.collisions = 10;
    const service = createService(createDb([]), redis);

    await expect(service.issueCode('discord-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('DiscordLinkService.consumeCode', () => {
  it('writes the link and spends the code in one go', async () => {
    const db = createDb([[], [], []]);
    const redis = new FakeRedis();
    const service = createService(db, redis);
    const { code } = await service.issueCode('discord-1');

    expect(await service.consumeCode(code, 'user-1')).toEqual({ discordUserId: 'discord-1' });
    expect(db.inserted).toEqual([{ userId: 'user-1', discordUserId: 'discord-1' }]);
    expect(redis.peek(codeKey(code))).toBeNull();
  });

  it('refuses a second use of the same code', async () => {
    const db = createDb([[], [], [], [], []]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');
    await service.consumeCode(code, 'user-1');

    await expect(service.consumeCode(code, 'user-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a code past its ten minutes', async () => {
    const redis = new FakeRedis();
    const service = createService(createDb([]), redis);
    const { code } = await service.issueCode('discord-1');

    redis.now += LINK_CODE_TTL_SECONDS * 1000 + 1;

    await expect(service.consumeCode(code, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the code in lower case', async () => {
    const db = createDb([[], [], []]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    expect(await service.consumeCode(code.toLowerCase(), 'user-1')).toEqual({
      discordUserId: 'discord-1',
    });
  });

  it('refuses a code nobody issued', async () => {
    const service = createService(createDb([]), new FakeRedis());

    await expect(service.consumeCode('ZZZZZZ', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is a no-op when the account already holds this Discord id', async () => {
    const db = createDb([[{ discordUserId: 'discord-1' }]]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    expect(await service.consumeCode(code, 'user-1')).toEqual({ discordUserId: 'discord-1' });
    expect(db.inserted).toEqual([]);
  });

  it('refuses when the account is linked to a different Discord id', async () => {
    const db = createDb([[], [{ discordUserId: 'discord-other' }]]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    await expect(service.consumeCode(code, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when the Discord id is linked to a different account', async () => {
    const db = createDb([[], [], [{ userId: 'user-other' }]]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    await expect(service.consumeCode(code, 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.inserted).toEqual([]);
  });

  it('refuses when the Discord id signs in to a different account', async () => {
    const db = createDb([[], [], [signInRow('user-other')]]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    await expect(service.consumeCode(code, 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.inserted).toEqual([]);
  });

  it('allows a Discord sign-in row that belongs to the same account', async () => {
    const db = createDb([[], [], [signInRow('user-1')]]);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    expect(await service.consumeCode(code, 'user-1')).toEqual({ discordUserId: 'discord-1' });
    expect(db.inserted).toEqual([{ userId: 'user-1', discordUserId: 'discord-1' }]);
  });

  it('turns a unique violation from a race into a 409', async () => {
    const db = createDb([[], [], [], []]);
    const dbError = Object.assign(new Error('duplicate key value'), {
      cause: { code: '23505' },
    });
    db.failNextInsert(dbError);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    await expect(service.consumeCode(code, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('passes any other database error through unchanged', async () => {
    const db = createDb([[], [], [], []]);
    const dbError = new Error('connection reset');
    db.failNextInsert(dbError);
    const service = createService(db, new FakeRedis());
    const { code } = await service.issueCode('discord-1');

    await expect(service.consumeCode(code, 'user-1')).rejects.toBe(dbError);
  });
});

describe('DiscordLinkService.deleteLink', () => {
  it('reports the removal and that sign-in still resolves the account', async () => {
    const db = createDb([[{ accountId: 'discord-1' }], [{ id: 'link-1' }]]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteLink('discord-1')).toEqual({
      removed: true,
      stillResolvable: true,
    });
  });

  it('reports nothing removed when the Discord account only signs in', async () => {
    const db = createDb([[{ accountId: 'discord-2' }], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteLink('discord-2')).toEqual({
      removed: false,
      stillResolvable: true,
    });
  });

  it('reports nothing removed and nothing resolvable for an unknown account', async () => {
    const db = createDb([[], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteLink('discord-3')).toEqual({
      removed: false,
      stillResolvable: false,
    });
  });
});

describe('DiscordLinkService.statusForUser', () => {
  it('reports the link row and whether Discord is also a sign-in method', async () => {
    const db = createDb([[{ discordUserId: 'discord-1' }], [{ accountId: 'discord-1' }]]);
    const service = createService(db, new FakeRedis());

    expect(await service.statusForUser('user-1')).toEqual({
      discordUserId: 'discord-1',
      source: 'link',
      signInMethod: true,
    });
  });

  it('falls back to the sign-in row', async () => {
    const db = createDb([[], [{ accountId: 'discord-9' }]]);
    const service = createService(db, new FakeRedis());

    expect(await service.statusForUser('user-1')).toEqual({
      discordUserId: 'discord-9',
      source: 'account',
      signInMethod: true,
    });
  });

  it('reports nothing for an unlinked account', async () => {
    const db = createDb([[], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.statusForUser('user-1')).toEqual({
      discordUserId: null,
      source: 'none',
      signInMethod: false,
    });
  });
});

describe('DiscordLinkService.deleteForUser', () => {
  it('deletes the link row and warns that sign-in still resolves the account', async () => {
    const db = createDb([[{ accountId: 'discord-1' }], [{ discordUserId: 'discord-1' }], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteForUser('user-1')).toEqual({ removed: true, stillResolvable: true });
  });

  it('leaves the account resolvable through sign-in only', async () => {
    const db = createDb([[], [{ discordUserId: 'discord-1' }], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteForUser('user-1')).toEqual({
      removed: true,
      stillResolvable: false,
    });
  });

  it('does nothing when there is no link row', async () => {
    const db = createDb([[{ accountId: 'discord-1' }], []]);
    const service = createService(db, new FakeRedis());

    expect(await service.deleteForUser('user-1')).toEqual({
      removed: false,
      stillResolvable: true,
    });
  });
});
