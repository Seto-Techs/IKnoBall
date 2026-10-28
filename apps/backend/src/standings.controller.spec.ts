import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandingsController } from './standings.controller';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the controller's constructor dependencies.
Reflect.defineMetadata('design:paramtypes', [DatabaseService, RedisService], StandingsController);

type Row = Record<string, unknown>;

/**
 * Minimal drizzle chain double. Every builder method returns the same thenable,
 * and awaiting it consumes the next queued response — `buildStandingsFromDb`
 * runs a `teams` select and then a joined games select.
 */
function createDb(responses: Row[][]) {
  let call = 0;

  const chain: any = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(responses[call++] ?? []).then(resolve, reject),
  };
  return chain;
}

function createRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    keyExists: vi.fn(async (key: string) => store.has(key)),
    getKey: vi.fn(async (key: string) => store.get(key) ?? ''),
    setKey: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

async function makeController(db: any, redis: any) {
  const moduleRef = await Test.createTestingModule({
    controllers: [StandingsController],
    providers: [
      { provide: DatabaseService, useValue: { db } },
      { provide: RedisService, useValue: redis },
    ],
  }).compile();
  return moduleRef.get(StandingsController);
}

const team = (abbreviation: string, conference: 'West' | 'East'): Row => ({
  abbreviation,
  logoUrl: `${abbreviation.toLowerCase()}.svg`,
  conference,
  externalId: abbreviation,
});

const lakers = team('LAL', 'West');
const blazers = team('POR', 'West');
const celtics = team('BOS', 'East');

/** A final game as the standings query reads it: away/home tricodes and scores. */
const final = (away: string, home: string, awayScore: number, homeScore: number): Row => ({
  homeTricode: home,
  awayTricode: away,
  homeScore,
  awayScore,
});

const byAbbr = (rows: { teamAbbr: string; wins: number; losses: number }[], abbr: string) =>
  rows.find((row) => row.teamAbbr === abbr);

beforeEach(() => {
  process.env.NBA_CURRENT_SEASON = '2026-27';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NBA_CURRENT_SEASON;
});

describe('StandingsController.getStandings', () => {
  it('counts a finished game against the team that lost it', async () => {
    // The reported bug: LAL beat PHX, SAC and MEM, then lost at home to POR, yet
    // the record still read 3-0. The loss is a row in scheduleGames, so it has to
    // show up as soon as the crawler writes the final score.
    const teams = [
      lakers,
      blazers,
      celtics,
      team('PHX', 'West'),
      team('SAC', 'West'),
      team('MEM', 'West'),
    ];
    const games = [
      final('PHX', 'LAL', 108, 122),
      final('LAL', 'SAC', 119, 112),
      final('MEM', 'LAL', 101, 130),
      final('POR', 'LAL', 136, 129),
    ];
    const controller = await makeController(createDb([teams, games]), createRedis());

    const res = await controller.getStandings();

    expect(res.is_success).toBe(true);
    expect(byAbbr(res.data!.West, 'LAL')).toMatchObject({ wins: 3, losses: 1 });
    expect(byAbbr(res.data!.West, 'POR')).toMatchObject({ wins: 1, losses: 0 });
    expect(byAbbr(res.data!.East, 'BOS')).toMatchObject({ wins: 0, losses: 0 });
  });

  it('ranks by record and derives games back from the conference leader', async () => {
    const games = [final('POR', 'LAL', 136, 129), final('BOS', 'LAL', 99, 120)];
    const controller = await makeController(
      createDb([[lakers, blazers, celtics], games]),
      createRedis(),
    );

    const res = await controller.getStandings();

    expect(res.data!.West.map((row) => row.teamAbbr)).toEqual(['POR', 'LAL']);
    expect(res.data!.West[0]).toMatchObject({ rank: 1, gamesBack: 0 });
    // POR 1-0 against LAL 1-1: half a game back.
    expect(res.data!.West[1]).toMatchObject({ rank: 2, gamesBack: 0.5 });
  });

  it('serves the record with cached clinch markers', async () => {
    const redis = createRedis({ 'standings:markers:2026-27': JSON.stringify({ LAL: 'x' }) });
    const controller = await makeController(createDb([[lakers, blazers, celtics], []]), redis);

    const res = await controller.getStandings();

    expect(byAbbr(res.data!.West, 'LAL')).toMatchObject({ wins: 0, losses: 0, marker: 'x' });
    expect(byAbbr(res.data!.West, 'POR')?.marker).toBeNull();
  });

  it('still answers when the feed times out, and backs off before retrying', async () => {
    // stats.nba.com is the only thing that can fail here, and it now only carries
    // clinch markers — a dead feed must not cost the caller a record.
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abort)),
    );
    const redis = createRedis();
    const controller = await makeController(
      createDb([[lakers, blazers, celtics], [final('POR', 'LAL', 136, 129)]]),
      redis,
    );

    const res = await controller.getStandings();
    await vi.waitFor(() => expect(redis.setKey).toHaveBeenCalled());

    expect(res.is_success).toBe(true);
    expect(byAbbr(res.data!.West, 'LAL')).toMatchObject({ wins: 0, losses: 1, marker: null });
    expect(redis.setKey).toHaveBeenCalledWith('standings:markers:2026-27', '{}', 1800);
  });
});
