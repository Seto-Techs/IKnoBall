import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PredictionsService } from './predictions.service';
import type { ResolvedOdds } from './odds.service';
import type { OddsService } from './odds.service';
import type { DatabaseService } from './infrastructure/database/database.service';

type Row = Record<string, unknown>;

interface DbDouble {
  db: unknown;
  /** Values passed to each `insert().values()`. */
  inserted: Row[];
  /** `set` payloads passed to each `onConflictDoUpdate()`. */
  conflicts: Row[];
}

/**
 * Minimal drizzle chain double.
 *
 * Each `where()` consumes the next queued response. `transaction` runs the
 * callback against the same chain, and `insert().returning()` echoes back the
 * values the service supplied, so assertions test what the service computed
 * rather than a canned fixture.
 */
function createDb(responses: Row[][]): DbDouble {
  let call = 0;
  let pending: Row | null = null;
  const inserted: Row[] = [];
  const conflicts: Row[] = [];

  const terminal = (rows: Row[]): any => {
    const p: any = {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
      catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
      limit: () => Promise.resolve(rows),
      orderBy: () => p,
      groupBy: () => p,
    };
    return p;
  };

  const chain: any = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    delete: () => chain,
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
    onConflictDoUpdate: (arg: { set: Row }) => {
      conflicts.push(arg.set);
      return chain;
    },
    returning: () => {
      const row = {
        id: 'pick-1',
        status: 'pending',
        points: null,
        settledAt: null,
        ...(pending ?? {}),
      };
      return Promise.resolve([row]);
    },
  };

  const db = {
    ...chain,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(chain),
  };

  return { db, inserted, conflicts };
}

/**
 * `getGameOdds` results are supplied separately because the odds cache lives
 * behind OddsService; this spec only covers the rules PredictionsService applies
 * to whatever odds it is handed.
 */
function makeService(responses: Row[][], oddsResults: (ResolvedOdds | null)[] = []) {
  const double = createDb(responses);
  let oddsCall = 0;
  const odds = {
    getGameOdds: async () => oddsResults[oddsCall++] ?? null,
  };
  const service = new PredictionsService(
    { db: double.db } as unknown as DatabaseService,
    odds as unknown as OddsService,
  );
  return { service, ...double };
}

const USER = 'user-1';
const GAME = '0012600009';
const FUTURE = new Date(Date.now() + 6 * 60 * 60 * 1000);

const openGame: Row = { gameId: GAME, gameStatus: 1, gameDateTimeUTC: FUTURE };

function odds(overrides: Partial<ResolvedOdds> = {}): ResolvedOdds {
  return {
    gameId: GAME,
    bookName: 'FanDuel',
    bookCountry: 'US',
    homeDecimal: 1.91,
    awayDecimal: 1.79,
    capturedAt: new Date(Date.now() - 60 * 1000),
    source: 'live',
    ...overrides,
  };
}

describe('placePick — game must still be open', () => {
  it('rejects an unknown game', async () => {
    const { service } = makeService([[]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a game that is no longer scheduled', async () => {
    const { service } = makeService([[{ ...openGame, gameStatus: 3 }]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toThrow(
      /no longer scheduled/,
    );
  });

  it('rejects a game that is live', async () => {
    const { service } = makeService([[{ ...openGame, gameStatus: 2 }]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toThrow(
      /no longer scheduled/,
    );
  });

  it('rejects a pick made exactly at tip-off', async () => {
    const { service } = makeService([[{ ...openGame, gameDateTimeUTC: new Date(Date.now() - 1) }]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toThrow(
      /tip-off has passed/,
    );
  });

  it('rejects a game with no tip-off time', async () => {
    const { service } = makeService([[{ ...openGame, gameDateTimeUTC: null }]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toThrow(
      /no tip-off time/,
    );
  });

  it('writes nothing when the game is rejected', async () => {
    const { service, inserted } = makeService([[{ ...openGame, gameStatus: 3 }]]);
    await expect(service.placePick(USER, { gameId: GAME, side: 'home' })).rejects.toThrow();
    expect(inserted).toEqual([]);
  });
});

describe('placePick — one call writes both modes', () => {
  it('returns both rows, flat first', async () => {
    const { service } = makeService([[openGame]], [odds()]);
    const picks = await service.placePick(USER, { gameId: GAME, side: 'home' });
    expect(picks.map((p) => p.mode)).toEqual(['flat', 'weighted']);
  });

  it('writes both rows with the same side', async () => {
    const { service, inserted } = makeService([[openGame]], [odds()]);
    await service.placePick(USER, { gameId: GAME, side: 'away' });

    expect(inserted).toHaveLength(2);
    expect(inserted.every((row) => row.side === 'away')).toBe(true);
    expect(inserted.every((row) => row.userId === USER)).toBe(true);
    expect(inserted.every((row) => row.gameId === GAME)).toBe(true);
  });

  it('never puts a price on the flat row, even when odds exist', async () => {
    const { service, inserted } = makeService([[openGame]], [odds()]);
    await service.placePick(USER, { gameId: GAME, side: 'home' });

    const flat = inserted.find((row) => row.mode === 'flat');
    expect(flat).toMatchObject({ lockedDecimal: null, lockedBook: null, lockedAt: null });
  });
});

describe('placePick — weighted locking', () => {
  it('locks the de-vigged price for the chosen side', async () => {
    const { service, inserted } = makeService([[openGame]], [odds()]);
    await service.placePick(USER, { gameId: GAME, side: 'home' });

    const weighted = inserted.find((row) => row.mode === 'weighted');
    // deVig(1.91, 1.79).home === 2.0670...
    expect(weighted?.lockedDecimal).toBeCloseTo(2.067, 3);
    expect(weighted?.lockedBook).toBe('FanDuel/US');
    expect(weighted?.lockedAt).toBeInstanceOf(Date);
  });

  it('locks the away side when away was picked', async () => {
    const { service, inserted } = makeService([[openGame]], [odds()]);
    await service.placePick(USER, { gameId: GAME, side: 'away' });

    const weighted = inserted.find((row) => row.mode === 'weighted');
    // deVig(1.91, 1.79).away === 1.9371...
    expect(weighted?.lockedDecimal).toBeCloseTo(1.937, 3);
  });

  it('leaves an even market untouched', async () => {
    const { service, inserted } = makeService(
      [[openGame]],
      [odds({ homeDecimal: 2, awayDecimal: 2 })],
    );
    await service.placePick(USER, { gameId: GAME, side: 'home' });
    const weighted = inserted.find((row) => row.mode === 'weighted');
    expect(weighted?.lockedDecimal).toBeCloseTo(2, 9);
  });

  it('locks a stale price rather than deferring, since the fallback is older still', async () => {
    const stale = odds({ capturedAt: new Date(Date.now() - 6 * 60 * 60 * 1000) });
    const { service, inserted } = makeService([[openGame]], [stale]);
    await service.placePick(USER, { gameId: GAME, side: 'home' });

    const weighted = inserted.find((row) => row.mode === 'weighted');
    expect(weighted?.lockedDecimal).toBeCloseTo(2.067, 3);
  });
});

describe('placePick — deferred when no price exists', () => {
  it('still saves both modes when there are no odds at all', async () => {
    const { service, inserted } = makeService([[openGame]], [null]);
    const picks = await service.placePick(USER, { gameId: GAME, side: 'home' });

    expect(picks).toHaveLength(2);
    expect(inserted).toHaveLength(2);
  });

  it('leaves the weighted row without a price and flags it pending', async () => {
    const { service } = makeService([[openGame]], [null]);
    const picks = await service.placePick(USER, { gameId: GAME, side: 'home' });

    const weighted = picks.find((p) => p.mode === 'weighted');
    expect(weighted).toMatchObject({
      lockedDecimal: null,
      lockedBook: null,
      lockedAt: null,
      pendingPrice: true,
    });
  });

  it('never flags a flat pick as pending, even with no odds', async () => {
    const { service } = makeService([[openGame]], [null]);
    const picks = await service.placePick(USER, { gameId: GAME, side: 'home' });

    expect(picks.find((p) => p.mode === 'flat')?.pendingPrice).toBe(false);
  });

  it('does not flag a weighted pick that did get a price', async () => {
    const { service } = makeService([[openGame]], [odds()]);
    const picks = await service.placePick(USER, { gameId: GAME, side: 'home' });

    expect(picks.find((p) => p.mode === 'weighted')?.pendingPrice).toBe(false);
  });
});

describe('placePick — editing re-locks', () => {
  it('recomputes the locked price instead of keeping the old one', async () => {
    const { service, conflicts } = makeService(
      [[openGame]],
      // The line moved: the favourite is now shorter than when first picked.
      [odds({ homeDecimal: 1.5, awayDecimal: 2.6 })],
    );
    await service.placePick(USER, { gameId: GAME, side: 'home' });

    const weighted = conflicts.find((set) => set.lockedDecimal != null);
    const relocked = weighted?.lockedDecimal as number;
    // deVig(1.5, 2.6).home === 1.5769...
    expect(relocked).toBeCloseTo(1.577, 3);
    expect(relocked).not.toBeCloseTo(2.067, 3);
  });

  it('never sets the conflict target in the update payload', async () => {
    const { service, conflicts } = makeService([[openGame]], [odds()]);
    await service.placePick(USER, { gameId: GAME, side: 'home' });

    expect(conflicts).toHaveLength(2);
    for (const set of conflicts) {
      expect(set).not.toHaveProperty('userId');
      expect(set).not.toHaveProperty('gameId');
      expect(set).not.toHaveProperty('mode');
    }
  });
});

describe('removePick', () => {
  it('refuses to remove once the game has started', async () => {
    const { service } = makeService([[{ ...openGame, gameStatus: 3 }]]);
    await expect(service.removePick(USER, GAME)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes while the game is open, without a mode argument', async () => {
    const { service } = makeService([[openGame], []]);
    await expect(service.removePick(USER, GAME)).resolves.toBeUndefined();
  });
});

describe('leaderboard', () => {
  it('ranks by points descending, starting at 1', async () => {
    const { service } = makeService([
      [
        { userId: 'a', name: 'lena', points: 88, picks: 5, correct: 4 },
        { userId: 'b', name: 'amir', points: 65, picks: 5, correct: 3 },
        { userId: 'c', name: 'priya', points: 23, picks: 5, correct: 2 },
      ],
    ]);
    const rows = await service.leaderboard('weighted');
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.name)).toEqual(['lena', 'amir', 'priya']);
  });

  it('returns an empty board when nothing has settled', async () => {
    const { service } = makeService([[]]);
    await expect(service.leaderboard('flat')).resolves.toEqual([]);
  });
});

describe('oddsPreview', () => {
  it('reports both sides with what each mode would pay', async () => {
    const { service } = makeService([[]], [odds()]);
    const preview = await service.oddsPreview(GAME);

    expect(preview.available).toBe(true);
    expect(preview.stale).toBe(false);
    expect(preview.book).toBe('FanDuel/US');
    expect(preview.home?.decimal).toBeCloseTo(2.067, 3);
    expect(preview.away?.decimal).toBeCloseTo(1.937, 3);
    // flat always pays 1; weighted pays round(10 * fair decimal)
    expect(preview.home?.flat).toBe(1);
    expect(preview.home?.weighted).toBe(21);
    expect(preview.away?.weighted).toBe(19);
  });

  it('flags a stale price rather than hiding it', async () => {
    const { service } = makeService(
      [[]],
      [odds({ capturedAt: new Date(Date.now() - 60 * 60 * 1000) })],
    );
    const preview = await service.oddsPreview(GAME);
    expect(preview.available).toBe(true);
    expect(preview.stale).toBe(true);
  });

  it('reports unavailability when no odds exist', async () => {
    const { service } = makeService([[]], [null]);
    const preview = await service.oddsPreview(GAME);
    expect(preview).toMatchObject({ available: false, home: null, away: null, book: null });
  });
});
