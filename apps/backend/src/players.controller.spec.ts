import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { PlayersController } from './players.controller';
import { DatabaseService } from './infrastructure/database/database.service';
import { SHOT_ZONE_IDS } from '@iknoball/shot-zones';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the controller's constructor dependency.
Reflect.defineMetadata('design:paramtypes', [DatabaseService], PlayersController);

type Row = Record<string, unknown>;

/**
 * Minimal drizzle chain double. The chain is itself thenable and each query
 * resolves the next queued response, which covers every shape the controller
 * builds: `where()`, `orderBy()`, `limit()` and `offset()` all hand the chain
 * back.
 */
function createDb(responses: Row[][]) {
  let call = 0;

  const chain: any = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(responses[call++] ?? []).then(resolve, reject),
  };
  return chain;
}

function makeController(responses: Row[][]) {
  const db = createDb(responses);
  return new PlayersController({ db } as unknown as DatabaseService);
}

async function makeApp(responses: Row[][]): Promise<INestApplication> {
  const db = createDb(responses);
  const moduleRef = await Test.createTestingModule({
    controllers: [PlayersController],
    providers: [{ provide: DatabaseService, useValue: { db } }],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

const playerRow: Row = {
  id: 'p-1',
  externalId: '1641705',
  firstName: 'Victor',
  lastName: 'Wembanyama',
  displayName: 'Victor Wembanyama',
  position: 'C',
  jersey: '1',
  height: '7-3',
  weight: '210',
  college: 'Metropolitans 92',
  country: 'FRA',
  draftYear: 2023,
  draftRound: 1,
  draftPick: 1,
  careerFrom: '2023',
  careerTo: '2026',
  teamId: 1610612759,
  teamAbbr: 'SAS',
};

const teamRows: Row[] = [
  {
    externalId: '1610612759',
    abbreviation: 'SAS',
    teamName: 'Spurs',
    fullName: 'San Antonio Spurs',
    city: 'San Antonio',
    conference: 'West',
    division: 'Southwest',
    logoUrl: 'https://cdn.nba.com/logos/nba/1610612759/global/L/logo.svg',
    arena: 'Frost Bank Center',
    headCoach: 'Mitch Johnson',
    primaryColor: '#C4CED4',
  },
  {
    externalId: '1610612756',
    abbreviation: 'PHX',
    teamName: 'Suns',
    fullName: 'Phoenix Suns',
    city: 'Phoenix',
    conference: 'West',
    division: 'Pacific',
    logoUrl: 'https://cdn.nba.com/logos/nba/1610612756/global/L/logo.svg',
    arena: 'Mortgage Matchup Center',
    headCoach: 'Jordan Ott',
    primaryColor: '#1D1160',
  },
  {
    externalId: '1610612737',
    abbreviation: 'ATL',
    teamName: 'Hawks',
    fullName: 'Atlanta Hawks',
    city: 'Atlanta',
    conference: 'East',
    division: 'Southeast',
    logoUrl: 'https://cdn.nba.com/logos/nba/1610612737/global/L/logo.svg',
    arena: 'State Farm Arena',
    headCoach: 'Quin Snyder',
    primaryColor: '#E03A3E',
  },
];

const seasonRows: Row[] = [
  {
    season: '2025-26',
    statsTimeframe: 'ByYear-regular',
    gp: 64,
    wins: 46,
    losses: 18,
    points: 25,
    rebounds: 11.5,
    assists: 3.109375,
    steals: 1.03125,
    blocks: 3.078125,
    fgPct: 0.512,
    fg3Pct: 0.349,
    ftPct: 0.827,
    pointsTotal: 1600,
    reboundsTotal: 736,
    assistsTotal: 199,
    stealsTotal: 66,
    blocksTotal: 197,
  },
  { season: '2025-26', statsTimeframe: 'ByYear-playoffs', gp: 22, points: 23.818181818181817 },
  { season: '2024-25', statsTimeframe: 'ByYear-regular', gp: 46, points: 24.26086956521739 },
];

/**
 * Games the player appeared in. The double cannot exercise the SQL that drops
 * the games they did not play — those rows are excluded in the query, not here —
 * so every fixture row carries real minutes.
 */
const logRows: Row[] = [
  {
    gameId: '0012600039',
    gameDate: '2026-10-10',
    homeTeamId: 1610612756,
    awayTeamId: 1610612759,
    homeScore: 111,
    awayScore: 118,
    homeTricode: 'PHX',
    awayTricode: 'SAS',
    teamExternalId: 1610612759,
    minutes: 'PT22M04.00S',
    points: 13,
    rebounds: 7,
    assists: 6,
    steals: 1,
    blocks: 2,
  },
  {
    gameId: '0012600005',
    gameDate: '2026-10-08',
    homeTeamId: 1610612759,
    awayTeamId: 1610612737,
    homeScore: 104,
    awayScore: 109,
    homeTricode: 'SAS',
    awayTricode: 'ATL',
    teamExternalId: 1610612759,
    minutes: 'PT17M00.00S',
    points: 9,
    rebounds: 6,
    assists: 1,
  },
];

const nextGameRow: Row = {
  id: '0012600042',
  homeTricode: 'SAS',
  awayTricode: 'ATL',
  homeTeamId: 1610612759,
  awayTeamId: 1610612737,
  gameDateTime: new Date('2026-10-14T23:00:00.000Z'),
  arenaName: 'Frost Bank Center',
  arenaCity: 'San Antonio',
};

/** Per-team splits for the 2025-26 season, as a traded player would have. */
const splitRows: Row[] = [
  {
    season: '2025-26',
    statsTimeframe: 'ByYear-regular',
    teamAbbr: 'SAS',
    gp: 40,
    wins: 30,
    losses: 10,
    points: 22.5,
    rebounds: 11,
    assists: 3.2,
    steals: 1.1,
    blocks: 2.4,
    fgPct: 0.52,
    fg3Pct: 0.35,
    ftPct: 0.8,
    pointsTotal: 900,
    reboundsTotal: 440,
    assistsTotal: 128,
    stealsTotal: 44,
    blocksTotal: 96,
  },
  {
    season: '2025-26',
    statsTimeframe: 'ByYear-regular',
    teamAbbr: 'ATL',
    gp: 24,
    wins: 8,
    losses: 16,
    points: 18.75,
    rebounds: 8,
    assists: 2.9,
    steals: 0.9,
    blocks: 1.8,
    fgPct: 0.47,
    fg3Pct: 0.32,
    ftPct: 0.77,
    pointsTotal: 450,
    reboundsTotal: 192,
    assistsTotal: 70,
    stealsTotal: 22,
    blocksTotal: 43,
  },
];

/** The player row the first query returns, as the double's first queued response. */
const playerQuery: Row[][] = [[playerRow]];

/** A detail response's queries, in call order: player, teams, seasons, splits, next game. */
const detailFixture = (
  over: {
    player?: Row[];
    seasons?: Row[];
    splits?: Row[];
    nextGame?: Row[];
  } = {},
): Row[][] => [
  over.player ?? [playerRow],
  teamRows,
  over.seasons ?? seasonRows,
  over.splits ?? [],
  over.nextGame ?? [nextGameRow],
];

describe('PlayersController.getById', () => {
  it('maps the bio, team, season stats and next game', async () => {
    const controller = makeController(detailFixture());

    const res = await controller.getById('p-1');

    expect(res.is_success).toBe(true);
    expect(res.message).toBe('Player fetched.');
    expect(res.data).toMatchObject({
      id: 'p-1',
      externalId: '1641705',
      name: 'Victor Wembanyama',
      position: 'C',
      jersey: '1',
      height: '7-3',
      weight: '210',
      college: 'Metropolitans 92',
      country: 'FRA',
      draftYear: 2023,
      draftRound: 1,
      draftPick: 1,
      careerFrom: '2023',
      careerTo: '2026',
    });
    // The hero renders a large portrait, so it asks for the big CDN crop.
    expect(res.data?.headshotUrl).toBe(
      'https://cdn.nba.com/headshots/nba/latest/1040x760/1641705.png',
    );
    expect(res.data?.team).toMatchObject({
      externalId: 1610612759,
      abbreviation: 'SAS',
      fullName: 'San Antonio Spurs',
      conference: 'West',
      division: 'Southwest',
      primaryColor: '#C4CED4',
    });
    expect(res.data?.seasons).toHaveLength(3);
    expect(res.data?.seasons[0]).toMatchObject({
      season: '2025-26',
      seasonType: 'regular',
      gp: 64,
      wins: 46,
      losses: 18,
      points: 25,
      rebounds: 11.5,
      // Per-game averages are rounded to one decimal; totals stay whole.
      assists: 3.1,
      steals: 1,
      blocks: 3.1,
      pointsTotal: 1600,
      reboundsTotal: 736,
    });
    expect(res.data?.seasons[1]).toMatchObject({ season: '2025-26', seasonType: 'playoffs' });
    expect(res.data?.seasons[2]).toMatchObject({ season: '2024-25', seasonType: 'regular' });
    // 2025-26 is the newest regular season on file, which is the season the
    // summary panel shows whether or not the feed calls it the current one.
    expect(res.data?.currentSeason).toMatchObject({
      season: '2025-26',
      seasonType: 'regular',
      points: 25,
    });
    expect(res.data?.nextGame).toMatchObject({
      id: '0012600042',
      // Read from the player's side: their team hosts this one, so the opponent
      // is the visitor.
      isHome: true,
      opponentTricode: 'ATL',
      opponentName: 'Atlanta Hawks',
      opponentLogoUrl: 'https://cdn.nba.com/logos/nba/1610612737/global/L/logo.svg',
      arenaName: 'Frost Bank Center',
    });
    expect(res.data?.nextGame?.gameDateTime).toBe('2026-10-14T23:00:00.000Z');
  });

  it('reports no splits for a season the player spent on one team', async () => {
    const controller = makeController(detailFixture());

    const res = await controller.getById('p-1');

    expect(res.data?.seasons.every((season) => season.teams.length === 0)).toBe(true);
  });

  it('reports no preseason row when the player has none on file', async () => {
    const controller = makeController(detailFixture());

    const res = await controller.getById('p-1');

    expect(res.data?.seasons.some((season) => season.seasonType === 'preseason')).toBe(false);
  });

  it('surfaces a ByYear-preseason feed row as a preseason season', async () => {
    const controller = makeController(
      detailFixture({
        seasons: [
          ...seasonRows,
          {
            season: '2026-27',
            statsTimeframe: 'ByYear-preseason',
            gp: 4,
            wins: 3,
            losses: 1,
            points: 15,
            rebounds: 5,
            assists: 3,
            steals: 1,
            blocks: 0.5,
            fgPct: 0.5,
            fg3Pct: 0.4,
            ftPct: 0.75,
            pointsTotal: 60,
            reboundsTotal: 20,
            assistsTotal: 12,
            stealsTotal: 4,
            blocksTotal: 2,
          },
        ],
      }),
    );

    const res = await controller.getById('p-1');
    const preseason = res.data?.seasons.find((season) => season.seasonType === 'preseason');

    expect(preseason).toMatchObject({
      season: '2026-27',
      seasonType: 'preseason',
      gp: 4,
      wins: 3,
      losses: 1,
      points: 15,
      rebounds: 5,
      assists: 3,
      blocks: 0.5,
      fgPct: 0.5,
      pointsTotal: 60,
    });
  });

  it('does not let a preseason row stand in as the current season', async () => {
    const controller = makeController(
      detailFixture({
        seasons: [
          { season: '2026-27', statsTimeframe: 'ByYear-preseason', gp: 4, points: 15 },
          {
            season: '2024-25',
            statsTimeframe: 'ByYear-regular',
            gp: 46,
            points: 24.26086956521739,
          },
        ],
      }),
    );

    const res = await controller.getById('p-1');

    // Only a regular-season row describes a season's averages.
    expect(res.data?.currentSeason).toMatchObject({ season: '2024-25', seasonType: 'regular' });
  });

  it('attaches each per-team split to its season, with the team identity', async () => {
    const controller = makeController(detailFixture({ splits: splitRows }));

    const res = await controller.getById('p-1');
    const season = res.data?.seasons.find(
      (s) => s.season === '2025-26' && s.seasonType === 'regular',
    );

    // Order comes from the query (most games first), not from the response.
    expect(season?.teams).toEqual([
      {
        teamAbbr: 'SAS',
        teamName: 'San Antonio Spurs',
        logoUrl: 'https://cdn.nba.com/logos/nba/1610612759/global/L/logo.svg',
        primaryColor: '#C4CED4',
        gp: 40,
        wins: 30,
        losses: 10,
        points: 22.5,
        rebounds: 11,
        assists: 3.2,
        steals: 1.1,
        blocks: 2.4,
        fgPct: 0.52,
        fg3Pct: 0.35,
        ftPct: 0.8,
        pointsTotal: 900,
        reboundsTotal: 440,
        assistsTotal: 128,
        stealsTotal: 44,
        blocksTotal: 96,
      },
      expect.objectContaining({ teamAbbr: 'ATL', teamName: 'Atlanta Hawks', gp: 24, points: 18.8 }),
    ]);
    // The splits belong to the season row, not the playoff row of the same label.
    expect(
      res.data?.seasons.find((s) => s.season === '2025-26' && s.seasonType === 'playoffs')?.teams,
    ).toEqual([]);
  });

  it('ignores a split whose season has no row', async () => {
    const controller = makeController(
      detailFixture({
        splits: [{ season: '1999-00', statsTimeframe: 'ByYear-regular', teamAbbr: 'SAS', gp: 5 }],
      }),
    );

    const res = await controller.getById('p-1');

    expect(res.data?.seasons.every((season) => season.teams.length === 0)).toBe(true);
  });

  it('falls back to the newest regular season when the current one has no row', async () => {
    const controller = makeController([
      ...playerQuery,
      teamRows,
      [{ season: '2024-25', statsTimeframe: 'ByYear-regular', gp: 46, points: 24.26086956521739 }],
      [],
      [],
    ]);

    const res = await controller.getById('p-1');

    expect(res.data?.currentSeason).toMatchObject({ season: '2024-25', points: 24.3 });
  });

  it('reports no team or next game for a player without a roster spot', async () => {
    const controller = makeController(
      detailFixture({ player: [{ ...playerRow, teamId: null, teamAbbr: null }] }),
    );

    const res = await controller.getById('p-1');

    expect(res.data?.team).toBeNull();
    expect(res.data?.nextGame).toBeNull();
  });

  it('returns null data when the player id is unknown', async () => {
    const controller = makeController([[]]);

    const res = await controller.getById('00000000-0000-0000-0000-000000000000');

    expect(res).toEqual({ is_success: true, message: 'Player not found.', data: null });
  });
});

describe('PlayersController.getGames', () => {
  /** The four queries a page of the game log runs, in call order. */
  const pageFixture = (total: unknown, rows: Row[] = logRows): Row[][] => [
    [{ id: 'p-1' }],
    [{ total }],
    rows,
    teamRows,
  ];

  it('pages the log and reports the offset it served', async () => {
    const controller = makeController(pageFixture('115'));

    const res = await controller.getGames('p-1', '10', '20');

    expect(res.is_success).toBe(true);
    expect(res.message).toBe('Game log fetched.');
    // `count()` arrives as a bigint string from pg.
    expect(res.data?.total).toBe(115);
    expect(res.data?.limit).toBe(10);
    expect(res.data?.offset).toBe(20);
    expect(res.data?.games).toHaveLength(2);
    // The log is pinned to one season, and says which, so the client can label it
    // without keeping its own idea of the current season.
    expect(res.data?.season).toBe('2025-26');
  });

  it('defaults to the first page of ten', async () => {
    const controller = makeController(pageFixture('115'));

    const res = await controller.getGames('p-1', undefined, undefined);

    expect(res.data?.limit).toBe(10);
    expect(res.data?.offset).toBe(0);
  });

  it('clamps a limit above the cap instead of serving the whole log', async () => {
    const controller = makeController(pageFixture('115'));

    const res = await controller.getGames('p-1', '5000', '0');

    expect(res.data?.limit).toBe(50);
  });

  it('rejects a malformed page parameter', async () => {
    const controller = makeController(pageFixture('115'));

    await expect(controller.getGames('p-1', 'ten', '0')).rejects.toThrow(
      'limit must be a non-negative integer',
    );
    await expect(controller.getGames('p-1', '10', '-1')).rejects.toThrow(
      'offset must be a non-negative integer',
    );
  });

  it('reads each game from the side the player turned out for', async () => {
    const controller = makeController(pageFixture('115'));

    const res = await controller.getGames('p-1', undefined, undefined);
    const games = res.data?.games ?? [];

    // The player was the visitor in Phoenix, where 118-111 is a win.
    expect(games[0]).toMatchObject({
      gameId: '0012600039',
      gameDate: '2026-10-10',
      opponentTricode: 'PHX',
      opponentName: 'Phoenix Suns',
      isHome: false,
      won: true,
      minutes: '22:04',
      points: 13,
      rebounds: 7,
      assists: 6,
    });
    // At home against Atlanta, 104-109 is a loss.
    expect(games[1]).toMatchObject({
      gameId: '0012600005',
      opponentTricode: 'ATL',
      isHome: true,
      won: false,
      minutes: '17:00',
    });
  });

  it('reports an empty page for a player with no games on file', async () => {
    const controller = makeController(pageFixture('0', []));

    const res = await controller.getGames('p-1', undefined, undefined);

    expect(res.data?.total).toBe(0);
    expect(res.data?.games).toEqual([]);
  });

  it('returns null data when the player id is unknown', async () => {
    const controller = makeController([[]]);

    const res = await controller.getGames('9999999999', undefined, undefined);

    expect(res).toEqual({ is_success: true, message: 'Player not found.', data: null });
  });
});

describe('PlayersController.getShotZones', () => {
  /**
   * The three queries the endpoint runs, in call order: the player, every season
   * and type they have attempts in, then the zone rows.
   */
  const zoneFixture = (
    zoneRows: Row[],
    available: Row[] = [{ season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '100' }],
    gpRows: Row[] = [{ season: '2025-26', statsTimeframe: 'ByYear-regular', gp: 70 }],
  ): Row[][] => [[{ id: 'p-1' }], available, gpRows, zoneRows];

  const allZones: Row[] = SHOT_ZONE_IDS.map((zoneId, index) => ({
    zoneId,
    // Distinct numbers per zone, so a mis-ordered response cannot pass.
    fga: 10 + index,
    fgm: 5,
  }));

  it('reports every zone in taxonomy order, including one with no rows', async () => {
    const withoutPaint = allZones.filter((row) => row.zoneId !== 'paint');
    const controller = makeController(zoneFixture(withoutPaint));

    const res = await controller.getShotZones('p-1');

    expect(res.is_success).toBe(true);
    expect(res.data?.zones).toHaveLength(SHOT_ZONE_IDS.length);
    // Order comes from the taxonomy, not from the rows.
    expect(res.data?.zones.map((z) => z.zoneId)).toEqual([...SHOT_ZONE_IDS]);
    // A zone with no row is reported as zeroed, not omitted, so the client always
    // receives the full partition. The worker only writes zones a player actually
    // shot from, so this is the normal case rather than an edge.
    const paint = res.data?.zones.find((z) => z.zoneId === 'paint');
    expect(paint).toEqual({ zoneId: 'paint', fga: 0, fgm: 0, fgPct: null });
  });

  it('computes each zone percentage and the totals', async () => {
    const controller = makeController(zoneFixture(allZones));

    const res = await controller.getShotZones('p-1');

    const restricted = res.data?.zones.find((z) => z.zoneId === 'restrictedArea');
    expect(restricted?.fga).toBe(10);
    expect(restricted?.fgm).toBe(5);
    expect(restricted?.fgPct).toBe(50);
    expect(res.data?.totalFga).toBe(allZones.reduce((n, row) => n + Number(row.fga), 0));
    expect(res.data?.totalFgm).toBe(allZones.length * 5);
  });

  it('lists every season and type with attempts, newest season first', async () => {
    // Within a season the types come in reading order rather than by volume, so
    // the regular season leads even when the playoffs outdrew it.
    const controller = makeController(
      zoneFixture(
        allZones,
        [
          { season: '2024-25', statsTimeframe: 'ByYear-regular', fga: '1200' },
          { season: '2025-26', statsTimeframe: 'ByYear-preseason', fga: '32' },
          { season: '2025-26', statsTimeframe: 'ByYear-playoffs', fga: '379' },
          { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
        ],
        [
          { season: '2024-25', statsTimeframe: 'ByYear-regular', gp: 71 },
          { season: '2025-26', statsTimeframe: 'ByYear-preseason', gp: 3 },
          { season: '2025-26', statsTimeframe: 'ByYear-playoffs', gp: 18 },
          { season: '2025-26', statsTimeframe: 'ByYear-regular', gp: 70 },
        ],
      ),
    );

    const res = await controller.getShotZones('p-1');

    // Games is matched per season and type, so each entry carries its own.
    expect(res.data?.available).toEqual([
      { season: '2025-26', seasonType: 'regular', fga: 1403, gp: 70 },
      { season: '2025-26', seasonType: 'playoffs', fga: 379, gp: 18 },
      { season: '2025-26', seasonType: 'preseason', fga: 32, gp: 3 },
      { season: '2024-25', seasonType: 'regular', fga: 1200, gp: 71 },
    ]);
  });

  it('reports games played from the season row, not from the games on file', async () => {
    // Games comes from the same per-season row the career table reads, so a
    // season whose schedule is only partly seeded still reports the real figure
    // rather than however many games the sync happened to cover.
    const controller = makeController(
      zoneFixture(
        allZones,
        [{ season: '2024-25', statsTimeframe: 'ByYear-regular', fga: '515' }],
        [{ season: '2024-25', statsTimeframe: 'ByYear-regular', gp: 71 }],
      ),
    );

    const res = await controller.getShotZones('p-1');

    expect(res.data?.available[0]).toEqual({
      season: '2024-25',
      seasonType: 'regular',
      fga: 515,
      gp: 71,
    });
  });

  it('leaves games null when no season row carries it', async () => {
    const controller = makeController(zoneFixture(allZones, undefined, []));

    const res = await controller.getShotZones('p-1');

    expect(res.data?.available[0].gp).toBeNull();
  });

  it('drops a season and type that has no attempts', async () => {
    // A zeroed rollup is not an option worth offering.
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
        { season: '2025-26', statsTimeframe: 'ByYear-playoffs', fga: '0' },
      ]),
    );

    const res = await controller.getShotZones('p-1');

    expect(res.data?.available).toEqual([
      { season: '2025-26', seasonType: 'regular', fga: 1403, gp: 70 },
    ]);
  });

  it('answers for the requested season when the player has data in it', async () => {
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
        { season: '2024-25', statsTimeframe: 'ByYear-regular', fga: '1200' },
      ]),
    );

    const res = await controller.getShotZones('p-1', 'regular', '2024-25');

    expect(res.data?.season).toBe('2024-25');
  });

  it('ignores an unknown season and leads with the newest on file', async () => {
    // A hand-typed season is a client bug rather than a valid empty page, so it
    // falls back instead of answering with nothing.
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
        { season: '2024-25', statsTimeframe: 'ByYear-regular', fga: '1200' },
      ]),
    );

    const res = await controller.getShotZones('p-1', 'regular', '1999-00');

    expect(res.data?.season).toBe('2025-26');
  });

  it('leads with the newest season even when it holds only a preseason', async () => {
    // Asking for the regular season with no season named must not answer from a
    // season that has no regular-season shots: the pair is matched together, so
    // this lands on the newest regular season rather than an empty newest year.
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2026-27', statsTimeframe: 'ByYear-preseason', fga: '17' },
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
      ]),
    );

    const res = await controller.getShotZones('p-1', 'regular');

    expect(res.data?.season).toBe('2025-26');
    expect(res.data?.totalFga).toBeGreaterThan(0);
  });

  it('leads with the current season regular season when there is one', async () => {
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2025-26', statsTimeframe: 'ByYear-preseason', fga: '17' },
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
      ]),
    );

    const res = await controller.getShotZones('p-1');

    expect(res.data?.season).toBe('2025-26');
    expect(res.data?.seasonType).toBe('regular');
  });

  it('skips a thin newest season when leading, rather than drawing an empty chart', async () => {
    // The current season is a few weeks old, so the newest entry is a preseason
    // with a handful of attempts. Leading with that would render a mostly empty
    // court, which reads as broken rather than quiet.
    const controller = makeController(
      zoneFixture(allZones, [
        { season: '2026-27', statsTimeframe: 'ByYear-preseason', fga: '17' },
        { season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' },
      ]),
    );

    const res = await controller.getShotZones('p-1');

    expect(res.data?.season).toBe('2025-26');
    expect(res.data?.seasonType).toBe('regular');
  });

  it('returns null data when the sync has not covered the player at all', async () => {
    const controller = makeController(zoneFixture([], []));

    const res = await controller.getShotZones('p-1');

    expect(res.data).toBeNull();
    expect(res.message).toBe('No shot-zone breakdown for this player yet.');
  });

  it('still answers for a season type the player has no attempts in', async () => {
    // The reader picked Playoffs but this player never played one. The payload
    // still comes back, every zone zeroed, so the client keeps the options it was
    // choosing between instead of losing them to a null.
    const controller = makeController(
      zoneFixture([], [{ season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '1403' }]),
    );

    const res = await controller.getShotZones('p-1', 'playoffs');

    expect(res.data).not.toBeNull();
    expect(res.data?.seasonType).toBe('playoffs');
    expect(res.data?.totalFga).toBe(0);
    expect(res.data?.zones).toHaveLength(SHOT_ZONE_IDS.length);
    expect(res.data?.zones.every((z) => z.fga === 0 && z.fgPct === null)).toBe(true);
  });

  it('falls back to the regular season for an unrecognised season type', async () => {
    const controller = makeController(zoneFixture(allZones));

    const res = await controller.getShotZones('p-1', 'nonsense');

    expect(res.is_success).toBe(true);
    expect(res.data?.seasonType).toBe('regular');
  });

  it('returns null data when the player id is unknown', async () => {
    const controller = makeController([[]]);

    const res = await controller.getShotZones('nope');

    expect(res.data).toBeNull();
    expect(res.message).toBe('Player not found.');
  });
});

describe('PlayersController routing', () => {
  it('serves a player by id over HTTP', async () => {
    const app = await makeApp(detailFixture());

    const res = await request(app.getHttpServer()).get('/api/players/p-1').expect(200);

    expect(res.body.data.name).toBe('Victor Wembanyama');
    expect(res.body.data.team.abbreviation).toBe('SAS');
    await app.close();
  });

  it('serves a page of the game log over HTTP without shadowing the :id route', async () => {
    const app = await makeApp([[{ id: 'p-1' }], [{ total: '115' }], logRows, teamRows]);

    const res = await request(app.getHttpServer())
      .get('/api/players/p-1/games?limit=10&offset=10')
      .expect(200);

    expect(res.body.data.total).toBe(115);
    expect(res.body.data.offset).toBe(10);
    expect(res.body.data.games).toHaveLength(2);
    await app.close();
  });

  it('rejects a malformed page parameter over HTTP', async () => {
    const app = await makeApp([[{ id: 'p-1' }]]);

    await request(app.getHttpServer()).get('/api/players/p-1/games?limit=ten').expect(400);
    await app.close();
  });

  it('serves shot zones over HTTP without shadowing the :id route', async () => {
    const app = await makeApp([
      [{ id: 'p-1' }],
      [{ season: '2025-26', statsTimeframe: 'ByYear-regular', fga: '20' }],
      [{ season: '2025-26', statsTimeframe: 'ByYear-regular', gp: 70 }],
      [{ zoneId: 'restrictedArea', fga: 20, fgm: 13 }],
    ]);

    const res = await request(app.getHttpServer()).get('/api/players/p-1/shot-zones').expect(200);

    expect(res.body.data.zones).toHaveLength(SHOT_ZONE_IDS.length);
    expect(res.body.data.zones[0]).toEqual({
      zoneId: 'restrictedArea',
      fga: 20,
      fgm: 13,
      fgPct: 65,
    });
    await app.close();
  });

  it('returns null data over HTTP for an unknown player', async () => {
    const app = await makeApp([[]]);

    const res = await request(app.getHttpServer()).get('/api/players/nope').expect(200);

    expect(res.body).toEqual({ is_success: true, message: 'Player not found.', data: null });
    await app.close();
  });
});
