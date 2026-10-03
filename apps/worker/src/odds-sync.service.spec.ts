import { describe, expect, it } from 'vitest';
import { OddsSyncService } from './odds-sync.service';
import type { DatabaseService } from './database.service';
import type { OddsGame, OddsProvider } from '@iknoball/predictions';

type Row = Record<string, unknown>;

interface DbDouble {
  db: unknown;
  updates: Row[];
}

/**
 * Query double: `select()` consumes the next queued response, and `update()`
 * records the `set` payload. `limit()`/`orderBy()` reuse the same rows so a
 * multi-step query advances the queue once.
 */
function createDb(responses: Row[][]): DbDouble {
  let call = 0;
  let lastSet: Row = {};
  const updates: Row[] = [];

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
    update: () => chain,
    set: (values: Row) => {
      lastSet = values;
      updates.push(values);
      return chain;
    },
  };

  return { db: chain, updates };
}

function makeService(responses: Row[][], games: OddsGame[] = []) {
  const double = createDb(responses);
  const provider: OddsProvider = { fetchMoneyline: async () => games };
  const service = new OddsSyncService(provider, { db: double.db } as unknown as DatabaseService);
  return { service, ...double };
}

const GAME = '0012600009';

function snapshotRow(overrides: Row = {}): Row {
  return {
    bookName: 'FanDuel',
    bookCountry: 'US',
    homeDecimal: 2,
    awayDecimal: 1.82,
    homeOpeningDecimal: 1.926,
    awayOpeningDecimal: 1.893,
    ...overrides,
  };
}

describe('resolveDeferredPicks', () => {
  it('does nothing when no pick is waiting for a price', async () => {
    const { service, updates } = makeService([[]]);
    await expect(service.resolveDeferredPicks()).resolves.toBe(0);
    expect(updates).toEqual([]);
  });

  it('prices a deferred weighted pick from the opening line', async () => {
    const { service, updates } = makeService(
      [
        [{ id: 'p1', gameId: GAME, side: 'home' }],
        [snapshotRow()], // preferred book
      ],
      [],
    );

    await expect(service.resolveDeferredPicks()).resolves.toBe(1);

    // deVig(1.926, 1.893).home === 2.0174...
    expect(updates[0]?.lockedDecimal).toBeCloseTo(2.017, 3);
    expect(updates[0]?.lockedBook).toBe('FanDuel/US');
    expect(updates[0]?.lockedAt).toBeInstanceOf(Date);
  });

  it('prices the away side when that is what was picked', async () => {
    const { service, updates } = makeService(
      [[{ id: 'p1', gameId: GAME, side: 'away' }], [snapshotRow()]],
      [],
    );

    await service.resolveDeferredPicks();
    // deVig(1.926, 1.893).away === 1.9829...
    expect(updates[0]?.lockedDecimal).toBeCloseTo(1.983, 3);
  });

  it('falls back to the current line when the feed carried no opening value', async () => {
    const { service, updates } = makeService(
      [
        [{ id: 'p1', gameId: GAME, side: 'home' }],
        [snapshotRow({ homeOpeningDecimal: null, awayOpeningDecimal: null })],
      ],
      [],
    );

    await service.resolveDeferredPicks();
    // deVig(2, 1.82).home === 2.0989...
    expect(updates[0]?.lockedDecimal).toBeCloseTo(2.099, 3);
  });

  it('falls back to another book when the preferred one has no snapshot', async () => {
    const { service, updates } = makeService(
      [
        [{ id: 'p1', gameId: GAME, side: 'home' }],
        [], // preferred book missing
        [
          snapshotRow({
            bookName: 'Novibet',
            bookCountry: 'GR',
            homeOpeningDecimal: 1.9,
            awayOpeningDecimal: 1.9,
          }),
        ],
      ],
      [],
    );

    await service.resolveDeferredPicks();
    expect(updates[0]?.lockedBook).toBe('Novibet/GR');
  });

  it('leaves a pick alone when no price exists for its game', async () => {
    const { service, updates } = makeService([
      [{ id: 'p1', gameId: GAME, side: 'home' }],
      [], // no snapshot at all
      [],
    ]);

    await expect(service.resolveDeferredPicks()).resolves.toBe(0);
    expect(updates).toEqual([]);
  });

  it('prices every deferred pick sharing a game with one lookup', async () => {
    const { service, updates } = makeService(
      [
        [
          { id: 'p1', gameId: GAME, side: 'home' },
          { id: 'p2', gameId: GAME, side: 'home' },
        ],
        [snapshotRow()],
      ],
      [],
    );

    await expect(service.resolveDeferredPicks()).resolves.toBe(2);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.lockedDecimal).toBeCloseTo(updates[1]?.lockedDecimal as number, 12);
  });
});

describe('syncOdds — deferred resolution runs even when the feed is empty', () => {
  it('still prices waiting picks when the feed returns nothing', async () => {
    // Feed empty, but a previously stored snapshot can still price the pick.
    const { service, updates } = makeService(
      [[{ id: 'p1', gameId: GAME, side: 'home' }], [snapshotRow()]],
      [],
    );

    const result = await service.syncOdds(new Date('2026-10-02T12:00:00Z'));

    expect(result).toMatchObject({ fetched: 0, written: 0, priced: 1 });
    expect(updates).toHaveLength(1);
  });
});
