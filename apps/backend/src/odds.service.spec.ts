import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNbaOdds, type OddsGame } from '@iknoball/predictions';
import { OddsService } from './odds.service';
import type { DatabaseService } from './infrastructure/database/database.service';
import type { RedisService } from './infrastructure/redis/redis.service';

vi.mock('@iknoball/predictions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@iknoball/predictions')>();
  return { ...actual, fetchNbaOdds: vi.fn() };
});

// Keep the TTLs deterministic regardless of the ambient environment.
delete process.env.ODDS_CACHE_TTL_SECONDS;
delete process.env.ODDS_MISS_CACHE_TTL_SECONDS;

type Row = Record<string, unknown>;

interface SetCall {
  key: string;
  value: string;
  opts?: { EX?: number; NX?: boolean; PX?: number };
}

function createRedis(options: { failGet?: boolean } = {}) {
  const store = new Map<string, string>();
  const sets: SetCall[] = [];

  const client = {
    get: async (key: string) => {
      if (options.failGet) throw new Error('redis down');
      return store.get(key) ?? null;
    },
    set: async (key: string, value: string, opts?: SetCall['opts']) => {
      sets.push({ key, value, opts });
      // NX only writes when absent; the lock relies on this.
      if (opts?.NX && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
  };

  return { store, sets, service: { getClient: () => client } };
}

function createDb(responses: Row[][]) {
  let call = 0;
  const inserted: Row[] = [];
  let pending: Row | null = null;

  const terminal = (rows: Row[]): any => {
    const p: any = {
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
      catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
      limit: () => Promise.resolve(rows),
      orderBy: () => p,
    };
    return p;
  };

  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => terminal(responses[call++] ?? []),
    insert: () => {
      pending = null;
      return chain;
    },
    values: (values: Row) => {
      pending = values;
      inserted.push(values);
      return chain;
    },
    onConflictDoNothing: () => Promise.resolve([]),
  };

  return { db: chain, inserted };
}

function makeService(dbResponses: Row[][], redisOptions: { failGet?: boolean } = {}) {
  const db = createDb(dbResponses);
  const redis = createRedis(redisOptions);
  const service = new OddsService(
    { db: db.db } as unknown as DatabaseService,
    redis.service as unknown as RedisService,
  );
  return { service, ...db, redis, sets: redis.sets };
}

const GAME = '0012600009';
const gameRow: Row = { homeTeamId: 1610612761, awayTeamId: 1610612748 };

function feedGame(overrides: Partial<OddsGame> = {}): OddsGame {
  return {
    gameId: GAME,
    homeTeamId: 1610612761,
    awayTeamId: 1610612748,
    books: [
      {
        bookId: 'sr:book:18186',
        bookName: 'FanDuel',
        countryCode: 'US',
        home: 1.91,
        away: 1.79,
        homeOpening: 1.86,
        awayOpening: 1.84,
      },
    ],
    ...overrides,
  };
}

function storedRow(overrides: Row = {}): Row {
  return {
    bookName: 'FanDuel',
    bookCountry: 'US',
    homeDecimal: 1.8,
    awayDecimal: 2.0,
    capturedAt: new Date(Date.now() - 10 * 60 * 1000),
    ...overrides,
  };
}

const mockFetch = vi.mocked(fetchNbaOdds);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('getGameOdds — cache', () => {
  it('serves a cached price without touching the feed or the database', async () => {
    const capturedAt = new Date().toISOString();
    const { service, redis, inserted } = makeService([]);
    redis.store.set(
      `odds:game:${GAME}`,
      JSON.stringify({
        state: 'odds',
        bookName: 'FanDuel',
        bookCountry: 'US',
        homeDecimal: 1.91,
        awayDecimal: 1.79,
        capturedAt,
      }),
    );

    const result = await service.getGameOdds(GAME);

    expect(result).toMatchObject({ source: 'cache', bookName: 'FanDuel', homeDecimal: 1.91 });
    expect(result?.capturedAt.toISOString()).toBe(capturedAt);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it('treats a cached miss as no odds, without re-fetching', async () => {
    const { service, redis } = makeService([]);
    redis.store.set(`odds:game:${GAME}`, JSON.stringify({ state: 'missing' }));

    await expect(service.getGameOdds(GAME)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses the cache on the second call, so the feed is fetched once', async () => {
    mockFetch.mockResolvedValue([feedGame()]);
    const { service } = makeService([[gameRow]]);

    const first = await service.getGameOdds(GAME);
    const second = await service.getGameOdds(GAME);

    expect(first?.source).toBe('live');
    expect(second?.source).toBe('cache');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getGameOdds — refresh from the feed', () => {
  it('fetches, records a snapshot, and caches the result for 5 minutes', async () => {
    mockFetch.mockResolvedValue([feedGame()]);
    const { service, inserted, sets } = makeService([[gameRow]]);

    const result = await service.getGameOdds(GAME);

    expect(result).toMatchObject({
      source: 'live',
      bookName: 'FanDuel',
      bookCountry: 'US',
      homeDecimal: 1.91,
      awayDecimal: 1.79,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ gameId: GAME, homeDecimal: 1.91, awayDecimal: 1.79 });

    const cacheWrite = sets.find((call) => call.key === `odds:game:${GAME}`);
    expect(cacheWrite?.opts?.EX).toBe(300);
  });

  it('matches a game by team ids when the feed omits gameId', async () => {
    mockFetch.mockResolvedValue([feedGame({ gameId: null })]);
    const { service } = makeService([[gameRow]]);

    const result = await service.getGameOdds(GAME);
    expect(result).toMatchObject({ source: 'live', homeDecimal: 1.91 });
  });

  it('prefers the configured book and falls back to the only one present', async () => {
    mockFetch.mockResolvedValue([
      feedGame({
        books: [
          {
            bookId: 'sr:book:1',
            bookName: 'Novibet',
            countryCode: 'GR',
            home: 1.95,
            away: 1.85,
            homeOpening: null,
            awayOpening: null,
          },
          {
            bookId: 'sr:book:2',
            bookName: 'FanDuel',
            countryCode: 'US',
            home: 1.91,
            away: 1.79,
            homeOpening: null,
            awayOpening: null,
          },
        ],
      }),
    ]);
    const { service } = makeService([[gameRow]]);

    await expect(service.getGameOdds(GAME)).resolves.toMatchObject({ bookName: 'FanDuel' });
  });

  it('returns null for a game that is not on the schedule', async () => {
    mockFetch.mockResolvedValue([feedGame()]);
    const { service } = makeService([[]]);

    await expect(service.getGameOdds(GAME)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('getGameOdds — fallbacks', () => {
  it('falls back to the stored snapshot when the feed is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('403'));
    const { service } = makeService([[gameRow], [storedRow()]]);

    const result = await service.getGameOdds(GAME);
    expect(result).toMatchObject({ source: 'stored', homeDecimal: 1.8, awayDecimal: 2.0 });
  });

  it('falls back to the stored snapshot when the feed has no price for the game', async () => {
    // No gameId and a different team pair: nothing in the feed describes this game.
    mockFetch.mockResolvedValue([feedGame({ gameId: null, homeTeamId: 1, awayTeamId: 2 })]);
    const { service, sets } = makeService([[gameRow], [storedRow()]]);

    const result = await service.getGameOdds(GAME);
    expect(result).toMatchObject({ source: 'stored' });

    // A miss is remembered briefly so an unpriced game is not re-fetched every request.
    const missWrite = sets.find((call) => call.key === `odds:game:${GAME}`);
    expect(missWrite?.opts?.EX).toBe(60);
    expect(JSON.parse(missWrite?.value ?? '{}')).toEqual({ state: 'missing' });
  });

  it('returns null when the feed has nothing and no snapshot exists', async () => {
    mockFetch.mockResolvedValue([]);
    const { service } = makeService([[gameRow], []]);

    await expect(service.getGameOdds(GAME)).resolves.toBeNull();
  });

  it('does not fetch while another request holds the lock', async () => {
    const { service, redis } = makeService([[], [storedRow()]]);
    redis.store.set(`odds:lock:${GAME}`, 'someone-else');

    const result = await service.getGameOdds(GAME);
    expect(result).toMatchObject({ source: 'stored' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('getGameOdds — Redis is optional', () => {
  it('still serves odds when the cache read fails', async () => {
    mockFetch.mockResolvedValue([feedGame()]);
    const { service } = makeService([[gameRow]], { failGet: true });

    await expect(service.getGameOdds(GAME)).resolves.toMatchObject({ source: 'live' });
  });
});
