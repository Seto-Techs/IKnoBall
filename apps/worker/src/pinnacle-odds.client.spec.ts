import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPinnacleOdds, PINNACLE_LEAGUE } from '@iknoball/predictions';
import type { DatabaseService } from './database.service';
import { PinnacleOddsClient } from './pinnacle-odds.client';

vi.mock('@iknoball/predictions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@iknoball/predictions')>();
  return { ...actual, fetchPinnacleOdds: vi.fn() };
});

const mockFetch = vi.mocked(fetchPinnacleOdds);

type Row = Record<string, unknown>;

/**
 * Query double: `select().from().where()` resolves the next queued response,
 * and a bare `select().from()` is thenable, so both query shapes work.
 */
function createDb(responses: Row[][]): DatabaseService {
  let call = 0;
  const terminal = (rows: Row[]): any => ({
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
    where: () => Promise.resolve(rows),
  });
  const chain: any = {
    select: () => chain,
    from: () => terminal(responses[call++] ?? []),
  };
  return { db: chain } as unknown as DatabaseService;
}

const SLATE_PRESEASON = [{ gameId: '0012600009' }];
const SLATE_REGULAR = [{ gameId: '0022500001' }];
const TEAMS = [
  { fullName: 'Toronto Raptors', externalId: '1610612761' },
  { fullName: 'Miami Heat', externalId: '1610612748' },
];

function pinnacleGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    matchupId: 1637593198,
    startTime: '2026-10-03T23:00:00Z',
    homeTeamName: 'Toronto Raptors',
    awayTeamName: 'Miami Heat',
    home: 1.5714285714,
    away: 2.42,
    ...overrides,
  };
}

describe('PinnacleOddsClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches the preseason league when the slate is preseason', async () => {
    mockFetch.mockResolvedValue([]);
    const client = new PinnacleOddsClient(createDb([SLATE_PRESEASON, TEAMS]));

    await client.fetchMoneyline(new Date('2026-10-03T12:00:00Z'));

    expect(mockFetch).toHaveBeenCalledWith([PINNACLE_LEAGUE.preseason], 15000);
  });

  it('fetches the main league when the slate is regular season', async () => {
    mockFetch.mockResolvedValue([]);
    const client = new PinnacleOddsClient(createDb([SLATE_REGULAR, TEAMS]));

    await client.fetchMoneyline(new Date('2026-10-25T12:00:00Z'));

    expect(mockFetch).toHaveBeenCalledWith([PINNACLE_LEAGUE.regular], 15000);
  });

  it('fetches both leagues when the window straddles the season change', async () => {
    mockFetch.mockResolvedValue([]);
    const client = new PinnacleOddsClient(
      createDb([[{ gameId: '0012600009' }, { gameId: '0022500001' }], TEAMS]),
    );

    await client.fetchMoneyline(new Date('2026-10-19T12:00:00Z'));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.arrayContaining([PINNACLE_LEAGUE.preseason, PINNACLE_LEAGUE.regular]),
      15000,
    );
  });

  it('does not call Pinnacle when the slate is empty', async () => {
    const client = new PinnacleOddsClient(createDb([[]]));

    const games = await client.fetchMoneyline(new Date('2026-07-01T12:00:00Z'));

    expect(games).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps team names to NBA ids and emits a single Pinnacle book with no opening line', async () => {
    mockFetch.mockResolvedValue([pinnacleGame()] as never);
    const client = new PinnacleOddsClient(createDb([SLATE_PRESEASON, TEAMS]));

    const games = await client.fetchMoneyline(new Date('2026-10-03T12:00:00Z'));

    expect(games).toEqual([
      {
        gameId: null,
        homeTeamId: 1610612761,
        awayTeamId: 1610612748,
        books: [
          {
            bookId: 'pinnacle',
            bookName: 'Pinnacle',
            countryCode: 'CW',
            home: 1.5714285714,
            away: 2.42,
            homeOpening: null,
            awayOpening: null,
          },
        ],
      },
    ]);
  });

  it('drops a game whose team name does not resolve', async () => {
    mockFetch.mockResolvedValue([
      pinnacleGame({ homeTeamName: 'Springfield Isotopes' }),
      pinnacleGame({ matchupId: 2 }),
    ] as never);
    const client = new PinnacleOddsClient(createDb([SLATE_PRESEASON, TEAMS]));

    const games = await client.fetchMoneyline(new Date('2026-10-03T12:00:00Z'));

    expect(games).toHaveLength(1);
    expect(games[0].homeTeamId).toBe(1610612761);
  });
});
