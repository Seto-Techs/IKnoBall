import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { players, playerSeasonStats, teams, scheduleDays, scheduleGames } from '@iknoball/database';
import { and, eq, desc, sql, inArray, asc } from 'drizzle-orm';

function getPreviousSeason(season: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return '2025-26';
  const first = parseInt(m[1], 10);
  const prevFirst = first - 1;
  const prevSecond = String(prevFirst + 1)
    .slice(-2)
    .padStart(2, '0');
  return `${prevFirst}-${prevSecond}`;
}

async function resolveSeasonStart(
  db: import('./infrastructure/database/database.service').DatabaseService['db'],
  season: string,
): Promise<Date | null> {
  if (process.env.NBA_SEASON_START_DATE) {
    const d = new Date(process.env.NBA_SEASON_START_DATE);
    if (!Number.isNaN(d.getTime())) return d;
  }
  try {
    const rows = await db
      .select({ dt: scheduleGames.gameDateTimeUTC })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(and(eq(scheduleDays.seasonYear, season), sql`${scheduleGames.gameLabel} = ''`))
      .orderBy(asc(scheduleGames.gameDateTimeUTC))
      .limit(1);
    if (rows.length && rows[0].dt) return rows[0].dt as Date;
  } catch {}
  const fallbackMap: Record<string, string> = {
    '2026-27': '2026-10-20T00:00:00Z',
    '2025-26': '2025-10-21T00:00:00Z',
  };
  if (fallbackMap[season]) return new Date(fallbackMap[season]);
  return null;
}

class LeaderEntry {
  @ApiProperty({ example: '1641705' })
  externalId!: string;

  @ApiProperty({ example: 'Victor Wembanyama' })
  name!: string;

  @ApiProperty({ example: 'SAS' })
  teamAbbr!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/headshots/nba/latest/260x190/1641705.png' })
  headshotUrl!: string;

  @ApiProperty({ example: '#C4CED4' })
  teamColor!: string;

  @ApiProperty({ example: 27.4 })
  value!: number;

  @ApiProperty({ example: 72 })
  gamesPlayed!: number;
}

class LeadersResponse {
  @ApiProperty({ example: '2025-26' })
  season!: string;

  @ApiProperty({ type: [LeaderEntry] })
  PTS!: LeaderEntry[];

  @ApiProperty({ type: [LeaderEntry] })
  REB!: LeaderEntry[];

  @ApiProperty({ type: [LeaderEntry] })
  AST!: LeaderEntry[];

  @ApiProperty({ type: [LeaderEntry] })
  STL!: LeaderEntry[];

  @ApiProperty({ type: [LeaderEntry] })
  BLK!: LeaderEntry[];
}

/** Per-game stat row shape needed for leaderboard ranking. */
export type LeaderStatRow = {
  gp: number | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
};

/**
 * Ranking order for a per-game stat, matching NBA.com: higher value first;
 * on equal value, fewer games played ranks higher.
 */
export function compareLeaderRows(
  field: 'pts' | 'reb' | 'ast' | 'stl' | 'blk',
  a: LeaderStatRow,
  b: LeaderStatRow,
): number {
  return (b[field] ?? 0) - (a[field] ?? 0) || (a.gp ?? 0) - (b.gp ?? 0);
}

/**
 * Qualification minimum for the per-game regular-season leaderboard, matching
 * NBA.com: a 58-GP minimum (of a full 82-GP season) pro-rated to season
 * progress — the official minimum scales with games already played (precedent:
 * the 66-game 2011-12 lockout season, minimum ≈ 47). `gamesSoFar` is the best
 * available proxy for season progress (max GP among players); at season start
 * it is small, so the floor is effectively ~0 and the board stays populated.
 */
export function computeMinGp(gamesSoFar: number): number {
  return Math.max(1, Math.ceil((58 * Math.max(0, gamesSoFar)) / 82));
}

const CATS: Record<string, { col: string; perGame: string }> = {
  PTS: { col: 'ptsTotal', perGame: 'ptsPerGame' },
  REB: { col: 'rebTotal', perGame: 'rebPerGame' },
  AST: { col: 'astTotal', perGame: 'astPerGame' },
  STL: { col: 'stlTotal', perGame: 'stlPerGame' },
  BLK: { col: 'blkTotal', perGame: 'blkPerGame' },
};

@ApiTags('Leaders')
@Controller('leaders')
export class LeadersController {
  constructor(private readonly db: DatabaseService) {}

  private async getEffectiveSeason(rawSeason: string): Promise<string> {
    const start = await resolveSeasonStart(this.db.db, rawSeason);
    if (!start || Number.isNaN(start.getTime())) return rawSeason;
    const now = new Date();
    const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 7) return getPreviousSeason(rawSeason);
    return rawSeason;
  }

  @Get()
  @ApiOperation({ summary: 'League leaders per game (top 5 per category) — season long' })
  @ApiDataResponse(LeadersResponse, HttpStatus.OK, 'Leaders fetched.', 'Leaders fetched.')
  async getLeaders(@Query('season') season?: string): Promise<ApiResponse<LeadersResponse>> {
    const raw = season ?? process.env.NBA_CURRENT_SEASON ?? '2025-26';
    const seasonYear = season ? raw : await this.getEffectiveSeason(raw);
    const limit = 5;

    // qualification guard, matching NBA.com's per-game regular-season leaderboard:
    // a 58-GP minimum pro-rated to season progress (58 of a full 82-GP season;
    // the official minimum scales with games already played, e.g. ~47 in the
    // 66-game 2011-12 lockout season). maxGp is our best proxy for progress.
    const maxGpRows = await this.db.db
      .select({ maxGp: sql<number>`MAX(${playerSeasonStats.gp})`.as('maxGp') })
      .from(playerSeasonStats)
      .where(
        and(
          eq(playerSeasonStats.season, seasonYear),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
        ),
      );
    const maxGp = (maxGpRows[0] as unknown as { maxGp: number | null })?.maxGp ?? 0;
    const minGp = computeMinGp(maxGp);

    // fetch all qualifying players once with their per-game stats
    const rows = await this.db.db
      .select({
        playerId: players.id,
        externalId: players.externalId,
        displayName: players.displayName,
        firstName: players.firstName,
        lastName: players.lastName,
        teamAbbr: players.teamAbbr,
        pts: playerSeasonStats.ptsPerGame,
        reb: playerSeasonStats.rebPerGame,
        ast: playerSeasonStats.astPerGame,
        stl: playerSeasonStats.stlPerGame,
        blk: playerSeasonStats.blkPerGame,
        gp: playerSeasonStats.gp,
      })
      .from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(
        and(
          eq(playerSeasonStats.season, seasonYear),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
          sql`${playerSeasonStats.gp} >= ${minGp}`,
        ),
      );

    // need team colors
    const abbrs = Array.from(
      new Set(rows.map((r) => (r.teamAbbr === 'BKN' ? 'BRK' : (r.teamAbbr ?? ''))).filter(Boolean)),
    );
    let colorByAbbr = new Map<string, string>();
    if (abbrs.length > 0) {
      const teamRows = await this.db.db
        .select({ abbreviation: teams.abbreviation, primaryColor: teams.primaryColor })
        .from(teams)
        .where(inArray(teams.abbreviation, abbrs));
      colorByAbbr = new Map(teamRows.map((t) => [t.abbreviation, t.primaryColor ?? '#E8E3DD']));
    }

    const round1 = (v: number | null) => (v == null ? 0 : Math.round(v * 10) / 10);
    const nameOf = (r: (typeof rows)[number]) => r.displayName ?? `${r.firstName} ${r.lastName}`;

    const build = (field: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'): LeaderEntry[] => {
      const sorted = [...rows]
        .filter((r) => r[field] != null)
        // NBA.com tie-break: equal value -> fewer games played ranks higher;
        // name last, purely for deterministic output
        .sort((a, b) => compareLeaderRows(field, a, b) || nameOf(a).localeCompare(nameOf(b)))
        .slice(0, limit);
      return sorted.map((r) => {
        const canonicalAbbr = r.teamAbbr === 'BKN' ? 'BRK' : (r.teamAbbr ?? '');
        return {
          externalId: r.externalId,
          name: nameOf(r),
          teamAbbr: canonicalAbbr,
          headshotUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${r.externalId}.png`,
          teamColor: colorByAbbr.get(canonicalAbbr) ?? '#E8E3DD',
          value: round1(r[field] as number | null),
          gamesPlayed: r.gp ?? 0,
        };
      });
    };

    const result: LeadersResponse = {
      season: seasonYear,
      PTS: build('pts'),
      REB: build('reb'),
      AST: build('ast'),
      STL: build('stl'),
      BLK: build('blk'),
    };

    return response(true, 'Leaders fetched.', result);
  }
}
