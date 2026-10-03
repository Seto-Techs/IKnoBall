import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { GamesController } from './games.controller';
import { DatabaseService } from './infrastructure/database/database.service';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the controller's constructor dependency.
Reflect.defineMetadata('design:paramtypes', [DatabaseService], GamesController);

type Row = Record<string, unknown>;

/**
 * Minimal drizzle chain double. Each `where()` consumes the next queued
 * response; the returned thenable also supports `.limit()` and `.orderBy()`,
 * which covers every query shape the controller builds.
 */
function createDb(responses: Row[][]) {
  let call = 0;

  const terminal = (): any => {
    const rows = responses[call++] ?? [];
    const p: any = Promise.resolve(rows);
    p.limit = () => Promise.resolve(rows);
    p.orderBy = () => p;
    return p;
  };

  const chain: any = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => terminal()),
  };
  return chain;
}

function makeController(responses: Row[][]) {
  const db = createDb(responses);
  return new GamesController({ db } as unknown as DatabaseService);
}

async function makeApp(responses: Row[][]): Promise<INestApplication> {
  const db = createDb(responses);
  const moduleRef = await Test.createTestingModule({
    controllers: [GamesController],
    providers: [{ provide: DatabaseService, useValue: { db } }],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

const gameRow: Row = {
  id: '0012600004',
  homeTricode: 'ATL',
  awayTricode: 'MEM',
  homeScore: null,
  awayScore: null,
  gameDateTime: new Date('2026-10-05T23:00:00.000Z'),
  status: 'Scheduled',
  arenaName: 'State Farm Arena',
  arenaCity: 'Atlanta',
  arenaState: 'GA',
  gameDate: '2026-10-05',
  gameLabel: 'Preseason',
  gameSubLabel: null,
  seriesText: null,
};

const teamRows: Row[] = [
  { abbreviation: 'ATL', fullName: 'Atlanta Hawks' },
  { abbreviation: 'MEM', fullName: 'Memphis Grizzlies' },
];

describe('GamesController.getById', () => {
  it('returns the mapped game for any id on the schedule', async () => {
    const controller = makeController([[gameRow], teamRows]);

    const res = await controller.getById('0012600004');

    expect(res.is_success).toBe(true);
    expect(res.message).toBe('Game fetched.');
    expect(res.data).toMatchObject({
      id: '0012600004',
      homeTeam: 'Atlanta Hawks',
      awayTeam: 'Memphis Grizzlies',
      homeTricode: 'ATL',
      awayTricode: 'MEM',
      gameDate: '2026-10-05',
      gameLabel: 'Preseason',
    });
    expect(res.data?.gameDateTime).toBe('2026-10-05T23:00:00.000Z');
  });

  it('resolves legacy tricodes through the abbreviation map', async () => {
    const controller = makeController([
      [{ ...gameRow, id: '0012600001', homeTricode: 'BKN', awayTricode: 'NYK' }],
      [
        { abbreviation: 'BRK', fullName: 'Brooklyn Nets' },
        { abbreviation: 'NYK', fullName: 'New York Knicks' },
      ],
    ]);

    const res = await controller.getById('0012600001');

    expect(res.data?.homeTeam).toBe('Brooklyn Nets');
    expect(res.data?.homeTricode).toBe('BRK');
    expect(res.data?.awayTeam).toBe('New York Knicks');
  });

  it('returns null data when the id is unknown', async () => {
    const controller = makeController([[]]);

    const res = await controller.getById('9999999999');

    expect(res).toEqual({ is_success: true, message: 'Game not found.', data: null });
  });
});

const currentGame = (over: Row = {}): Row => ({
  homeTricode: 'ATL',
  awayTricode: 'MEM',
  seasonYear: '2026-27',
  ...over,
});

describe('GamesController.getHeadToHead', () => {
  it('aggregates the prior-season regular-season series from the current game perspective', async () => {
    // ATL is the home team in the current game, but MEM hosted the first meeting.
    const meetings: Row[] = [
      {
        id: '0022500623',
        homeTricode: 'MEM',
        awayTricode: 'ATL',
        homeScore: 122,
        awayScore: 124,
        gameDate: '2026-01-21',
        gameDateTime: new Date('2026-01-22T00:00:00Z'),
      },
      {
        id: '0022501037',
        homeTricode: 'ATL',
        awayTricode: 'MEM',
        homeScore: 146,
        awayScore: 107,
        gameDate: '2026-03-23',
        gameDateTime: new Date('2026-03-23T23:00:00Z'),
      },
    ];
    const controller = makeController([[currentGame()], meetings, teamRows]);

    const res = await controller.getHeadToHead('0012600004');

    expect(res.data?.season).toBe('2025-26');
    expect(res.data?.home).toMatchObject({
      tricode: 'ATL',
      team: 'Atlanta Hawks',
      wins: 2,
      losses: 0,
    });
    expect(res.data?.away).toMatchObject({
      tricode: 'MEM',
      team: 'Memphis Grizzlies',
      wins: 0,
      losses: 2,
    });
    expect(res.data?.meetings.map((m) => m.id)).toEqual(['0022500623', '0022501037']);
  });

  it('attributes wins correctly when the current home team was the visitor', async () => {
    // Current game has MEM at home; ATL won both meetings, one of them as visitor.
    const meetings: Row[] = [
      {
        id: 'a',
        homeTricode: 'ATL',
        awayTricode: 'MEM',
        homeScore: 100,
        awayScore: 90,
        gameDate: '2026-01-01',
        gameDateTime: new Date('2026-01-02T00:00:00Z'),
      },
      {
        id: 'b',
        homeTricode: 'MEM',
        awayTricode: 'ATL',
        homeScore: 88,
        awayScore: 95,
        gameDate: '2026-02-01',
        gameDateTime: new Date('2026-02-02T00:00:00Z'),
      },
    ];
    const controller = makeController([
      [currentGame({ homeTricode: 'MEM', awayTricode: 'ATL' })],
      meetings,
      teamRows,
    ]);

    const res = await controller.getHeadToHead('0012600004');

    expect(res.data?.home).toMatchObject({ tricode: 'MEM', wins: 0, losses: 2 });
    expect(res.data?.away).toMatchObject({ tricode: 'ATL', wins: 2, losses: 0 });
  });

  it('canonicalizes legacy tricodes in the response', async () => {
    const meetings: Row[] = [
      {
        id: 'a',
        homeTricode: 'BKN',
        awayTricode: 'NYK',
        homeScore: 100,
        awayScore: 90,
        gameDate: '2026-01-01',
        gameDateTime: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    const controller = makeController([
      [currentGame({ homeTricode: 'BKN', awayTricode: 'NYK' })],
      meetings,
      [
        { abbreviation: 'BRK', fullName: 'Brooklyn Nets' },
        { abbreviation: 'NYK', fullName: 'New York Knicks' },
      ],
    ]);

    const res = await controller.getHeadToHead('0012600001');

    expect(res.data?.home.tricode).toBe('BRK');
    expect(res.data?.home.team).toBe('Brooklyn Nets');
    expect(res.data?.meetings[0].homeTricode).toBe('BRK');
  });

  it('returns an empty series when the prior season has no meetings', async () => {
    const controller = makeController([[currentGame()], []]);

    const res = await controller.getHeadToHead('0012600004');

    expect(res.data?.season).toBe('2025-26');
    expect(res.data?.meetings).toEqual([]);
    expect(res.data?.home).toMatchObject({ wins: 0, losses: 0 });
    expect(res.data?.away).toMatchObject({ wins: 0, losses: 0 });
  });

  it('returns null data when the game id is unknown', async () => {
    const controller = makeController([[]]);

    const res = await controller.getHeadToHead('9999999999');

    expect(res).toEqual({ is_success: true, message: 'Game not found.', data: null });
  });
});

describe('GamesController routing', () => {
  it('serves a game by id over HTTP', async () => {
    const app = await makeApp([[gameRow], teamRows]);

    const res = await request(app.getHttpServer()).get('/api/games/0012600004').expect(200);

    expect(res.body.data.id).toBe('0012600004');
    expect(res.body.data.homeTeam).toBe('Atlanta Hawks');
    await app.close();
  });

  it('serves the head-to-head series over HTTP without shadowing the :id route', async () => {
    const app = await makeApp([[currentGame()], []]);

    const res = await request(app.getHttpServer())
      .get('/api/games/0012600004/head-to-head')
      .expect(200);

    expect(res.body.data.season).toBe('2025-26');
    expect(res.body.data.meetings).toEqual([]);
    await app.close();
  });

  it('does not let the :id route swallow the static next/range routes', async () => {
    const app = await makeApp([[], []]);

    const next = await request(app.getHttpServer()).get('/api/games/next').expect(200);
    expect(next.body.message).toBe('No upcoming games.');

    const range = await request(app.getHttpServer())
      .get('/api/games/range?from=2026-10-01&to=2026-10-07')
      .expect(200);
    expect(range.body.message).toBe('No games in range.');

    await app.close();
  });
});

/**
 * Collects the column names referenced by a drizzle condition. A game tipping
 * 8:00 PM ET on the last day of a window is 00:00 UTC the following day, so
 * filtering the range on the UTC timestamp drops it from its own date.
 */
function conditionColumns(condition: unknown): Set<string> {
  const names = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const candidate = node as { name?: unknown; queryChunks?: unknown };
    if (typeof candidate.name === 'string') names.add(candidate.name);
    if (Array.isArray(candidate.queryChunks)) candidate.queryChunks.forEach(walk);
  };
  walk(condition);
  return names;
}

describe('GamesController.getRange window', () => {
  it('filters on the schedule date rather than the UTC timestamp', async () => {
    const whereArgs: unknown[] = [];
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn((condition: unknown) => {
        whereArgs.push(condition);
        const p: any = Promise.resolve([]);
        p.orderBy = () => p;
        return p;
      }),
    };
    const controller = new GamesController({ db: chain } as unknown as DatabaseService);

    await controller.getRange('2026-10-02', '2026-10-08');

    const columns = conditionColumns(whereArgs[0]);
    expect(columns.has('gameDate')).toBe(true);
    expect(columns.has('gameDateTimeUTC')).toBe(false);
  });
});
