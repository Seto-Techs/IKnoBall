import { describe, expect, it } from 'vitest';
import { PredictionSettlementService } from './prediction-settlement.service';
import type { DatabaseService } from './database.service';

type Row = Record<string, unknown>;

interface DbDouble {
  db: unknown;
  /** `set` payloads from every update issued inside a transaction. */
  updates: Row[];
  transactions: number;
}

/**
 * Query double for the settlement service.
 *
 * `select()` returns the queued rows; `transaction(fn)` runs the callback
 * against a recording update chain so assertions can inspect what was written.
 */
function createDb(responses: Row[][]): DbDouble {
  let call = 0;
  let lastSet: Row = {};
  const updates: Row[] = [];
  let transactions = 0;

  const selectChain: any = {
    select: () => selectChain,
    from: () => selectChain,
    leftJoin: () => selectChain,
    where: () => Promise.resolve(responses[call++] ?? []),
  };

  const updateChain: any = {
    update: () => updateChain,
    set: (values: Row) => {
      lastSet = values;
      return updateChain;
    },
    where: () => {
      updates.push(lastSet);
      return Promise.resolve([]);
    },
  };

  return {
    db: {
      select: selectChain.select,
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        transactions += 1;
        await fn(updateChain);
      },
    },
    updates,
    transactions,
  };
}

function makeService(responses: Row[][]) {
  const double = createDb(responses);
  const service = new PredictionSettlementService({
    db: double.db,
  } as unknown as DatabaseService);
  return { service, ...double };
}

const HOUR = 60 * 60 * 1000;

function pick(overrides: Row = {}): Row {
  return {
    id: 'pick-1',
    mode: 'flat',
    side: 'home',
    lockedDecimal: null,
    gameStatus: 3,
    homeScore: 110,
    awayScore: 100,
    gameDateTimeUTC: new Date(Date.now() - 3 * HOUR),
    ...overrides,
  };
}

describe('settlePending — flat scoring', () => {
  it('pays 1 point for a correct pick', async () => {
    const { service, updates } = makeService([[pick({ mode: 'flat', side: 'home' })]]);
    const result = await service.settlePending();
    expect(result.settled).toBe(1);
    expect(updates[0]).toMatchObject({ points: 1, status: 'settled' });
  });

  it('pays 0 for a wrong pick', async () => {
    const { service, updates } = makeService([[pick({ mode: 'flat', side: 'away' })]]);
    await service.settlePending();
    expect(updates[0]).toMatchObject({ points: 0, status: 'settled' });
  });

  it('pays 1 even when a stray price is attached', async () => {
    const { service, updates } = makeService([
      [pick({ mode: 'flat', side: 'home', lockedDecimal: 4.6 })],
    ]);
    await service.settlePending();
    expect(updates[0]?.points).toBe(1);
  });
});

describe('settlePending — weighted scoring', () => {
  it('pays the locked price times the scale on a correct pick', async () => {
    const { service, updates } = makeService([
      [pick({ mode: 'weighted', side: 'home', lockedDecimal: 2.067 })],
    ]);
    await service.settlePending();
    // round(10 * 2.067) === 21
    expect(updates[0]).toMatchObject({ points: 21, status: 'settled' });
  });

  it('pays nothing for a wrong pick, however long the price', async () => {
    const { service, updates } = makeService([
      [pick({ mode: 'weighted', side: 'away', lockedDecimal: 12 })],
    ]);
    await service.settlePending();
    expect(updates[0]).toMatchObject({ points: 0, status: 'settled' });
  });

  it('pays an underdog more than a favourite', async () => {
    // Home wins 110-100, so the home side is the one that came in.
    const { service, updates } = makeService([
      [
        pick({ id: 'fav', mode: 'weighted', side: 'away', lockedDecimal: 1.266 }),
        pick({ id: 'dog', mode: 'weighted', side: 'home', lockedDecimal: 4.764 }),
      ],
    ]);
    await service.settlePending();
    expect(updates[0]?.points).toBe(0); // favourite picked the losing side
    expect(updates[1]?.points).toBe(48); // underdog came in
    expect(updates[1]?.points).toBeGreaterThan((updates[0]?.points as number) + 47);
  });

  it('caps a corrupt long price at the ceiling', async () => {
    const { service, updates } = makeService([
      [pick({ mode: 'weighted', side: 'home', lockedDecimal: 3000 })],
    ]);
    await service.settlePending();
    expect(updates[0]?.points).toBe(150);
  });

  it('voids a weighted pick that never got a price, rather than scoring it 0', async () => {
    // Scoring it 0 would punish a correct pick for a feed gap, so it is voided.
    const { service, updates } = makeService([
      [pick({ mode: 'weighted', side: 'home', lockedDecimal: null })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ voided: 1, settled: 0 });
    expect(updates[0]).toMatchObject({ status: 'voided', points: null });
  });

  it('still scores a flat pick with no price, since flat never needs one', async () => {
    const { service, updates } = makeService([
      [pick({ mode: 'flat', side: 'home', lockedDecimal: null })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ settled: 1, voided: 0 });
    expect(updates[0]).toMatchObject({ points: 1, status: 'settled' });
  });
});

describe('settlePending — nothing to do', () => {
  it('issues no transaction when there are no pending picks', async () => {
    const { service, transactions, updates } = makeService([[]]);
    const result = await service.settlePending();
    expect(result).toEqual({ settled: 0, voided: 0, pending: 0 });
    expect(transactions).toBe(0);
    expect(updates).toEqual([]);
  });

  it('leaves a scheduled game alone', async () => {
    const { service, transactions } = makeService([[pick({ gameStatus: 1 })]]);
    const result = await service.settlePending();
    expect(result).toEqual({ settled: 0, voided: 0, pending: 1 });
    expect(transactions).toBe(0);
  });

  it('leaves a live game alone', async () => {
    const { service } = makeService([[pick({ gameStatus: 2 })]]);
    await expect(service.settlePending()).resolves.toMatchObject({ pending: 1, settled: 0 });
  });
});

describe('settlePending — unreadable final results stay pending', () => {
  it('leaves a final game with no scores pending rather than guessing', async () => {
    const { service, transactions } = makeService([
      [pick({ gameStatus: 3, homeScore: null, awayScore: null })],
    ]);
    const result = await service.settlePending();
    expect(result).toEqual({ settled: 0, voided: 0, pending: 1 });
    expect(transactions).toBe(0);
  });

  it('leaves a tied final score pending', async () => {
    const { service } = makeService([[pick({ gameStatus: 3, homeScore: 100, awayScore: 100 })]]);
    await expect(service.settlePending()).resolves.toMatchObject({ pending: 1, settled: 0 });
  });
});

describe('settlePending — voiding', () => {
  it('voids a pick whose schedule row is gone', async () => {
    const { service, updates } = makeService([
      [pick({ gameStatus: null, homeScore: null, awayScore: null })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ voided: 1, settled: 0 });
    expect(updates[0]).toMatchObject({ status: 'voided', points: null });
  });

  it('voids a game that never finished, long past tip-off', async () => {
    const { service, updates } = makeService([
      [pick({ gameStatus: 1, gameDateTimeUTC: new Date(Date.now() - 72 * HOUR) })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ voided: 1, settled: 0 });
    expect(updates[0]).toMatchObject({ status: 'voided', points: null });
  });

  it('does not void a merely delayed game inside the window', async () => {
    const { service, transactions } = makeService([
      [pick({ gameStatus: 2, gameDateTimeUTC: new Date(Date.now() - 2 * HOUR) })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ pending: 1, voided: 0 });
    expect(transactions).toBe(0);
  });

  it('voids at exactly the threshold and not a moment before', async () => {
    const threshold = 48 * HOUR;
    const justInside = makeService([
      [pick({ gameStatus: 1, gameDateTimeUTC: new Date(Date.now() - threshold + 60_000) })],
    ]);
    await expect(justInside.service.settlePending()).resolves.toMatchObject({ voided: 0 });

    const justOutside = makeService([
      [pick({ gameStatus: 1, gameDateTimeUTC: new Date(Date.now() - threshold - 60_000) })],
    ]);
    await expect(justOutside.service.settlePending()).resolves.toMatchObject({ voided: 1 });
  });

  it('never voids a final game even when it is old', async () => {
    const { service, updates } = makeService([
      [pick({ gameStatus: 3, gameDateTimeUTC: new Date(Date.now() - 100 * HOUR) })],
    ]);
    const result = await service.settlePending();
    expect(result).toMatchObject({ settled: 1, voided: 0 });
    expect(updates[0]?.status).toBe('settled');
  });
});

describe('settlePending — mixed batch', () => {
  it('settles, voids, and leaves pending in one pass', async () => {
    const { service, updates } = makeService([
      [
        pick({ id: 'settle-me', gameStatus: 3, side: 'home', mode: 'flat' }),
        pick({ id: 'void-me', gameStatus: null, homeScore: null, awayScore: null }),
        pick({ id: 'wait', gameStatus: 1, gameDateTimeUTC: new Date(Date.now() + HOUR) }),
      ],
    ]);
    const result = await service.settlePending();

    expect(result).toEqual({ settled: 1, voided: 1, pending: 1 });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ points: 1, status: 'settled' });
    expect(updates[1]).toMatchObject({ status: 'voided', points: null });
  });

  it('stamps settledAt from the supplied clock', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const { service, updates } = makeService([[pick()]]);
    await service.settlePending(now);
    expect(updates[0]?.settledAt).toEqual(now);
    expect(updates[0]?.updatedAt).toEqual(now);
  });
});
