import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { teams, players, playerSeasonStats, scheduleDays, scheduleGames } from '@iknoball/database';
import { eq, and, or, notInArray, desc, sql, gte, lt, asc, inArray, max } from 'drizzle-orm';

// Map BKN → BRK (players/schedule tricodes use BKN, teams table uses BRK)
const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

function teamName(tricode: string | null, byAbbr: Map<string, string>): string {
  const abbr = ABBR_MAP[tricode ?? ''] ?? tricode ?? '';
  return byAbbr.get(abbr) ?? abbr;
}

class StatLeader {
  @ApiProperty({ example: 'Victor Wembanyama' })
  name!: string;

  @ApiProperty({ example: 25.0 })
  value!: number;
}

class TeamLeaders {
  @ApiProperty()
  pts!: StatLeader;

  @ApiProperty()
  reb!: StatLeader;

  @ApiProperty()
  ast!: StatLeader;
}

class TeamResponse {
  @ApiProperty({ example: 1610612759 })
  externalId!: number;

  @ApiProperty({ example: 'SAS' })
  abbreviation!: string;

  @ApiProperty({ example: 'Spurs' })
  teamName!: string;

  @ApiProperty({ example: 'San Antonio Spurs' })
  fullName!: string;

  @ApiProperty({ example: 'San Antonio' })
  city!: string;

  @ApiProperty({ example: 'West' })
  conference!: string;

  @ApiProperty({ example: 'Southwest' })
  division!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612759/global/L/logo.svg' })
  logoUrl!: string;

  @ApiProperty({ example: 'Frost Bank Center' })
  arena!: string;

  @ApiProperty({ example: 'Mitch Johnson' })
  headCoach!: string;

  @ApiProperty({ example: '#C4CED4' })
  primaryColor!: string;

  @ApiProperty({ nullable: true })
  leaders!: TeamLeaders | null;
}

class LastGameResponse {
  @ApiProperty({ example: 'NYK' })
  opponentAbbr!: string;

  @ApiProperty({ example: true })
  isHome!: boolean;

  @ApiProperty({ example: 115 })
  ourScore!: number;

  @ApiProperty({ example: 111 })
  oppScore!: number;

  @ApiProperty({ example: '2026-06-08' })
  gameDate!: string;
}

class TeamRecordResponse {
  @ApiProperty({ example: 54 })
  wins!: number;

  @ApiProperty({ example: 28 })
  losses!: number;

  @ApiProperty({ example: 'Western Conference' })
  conference!: string;

  @ApiProperty({ example: 'Southwest Division' })
  division!: string;

  @ApiProperty({ type: [LastGameResponse] })
  lastGames!: LastGameResponse[];
}

class GameResponse {
  @ApiProperty({ example: '20260616/NYKSAS' })
  id!: string;

  @ApiProperty({ example: 'San Antonio Spurs' })
  homeTeam!: string;

  @ApiProperty({ example: 'New York Knicks' })
  awayTeam!: string;

  @ApiProperty({ example: null, nullable: true })
  homeScore!: number | null;

  @ApiProperty({ example: null, nullable: true })
  awayScore!: number | null;

  @ApiProperty({ example: '2026-06-19T23:00:00.000Z' })
  gameDateTime!: string;

  @ApiProperty({ example: 'Scheduled' })
  status!: string;

  @ApiProperty({ example: 'Frost Bank Center', nullable: true })
  arenaName!: string | null;

  @ApiProperty({ example: 'San Antonio', nullable: true })
  arenaCity!: string | null;

  @ApiProperty({ example: 'TX', nullable: true })
  arenaState!: string | null;
}

class PlayerStatResponse {
  @ApiProperty({ example: '0a1b2c3d-4e5f-6789-abcd-ef0123456789' })
  id!: string;

  @ApiProperty({ example: 'Victor Wembanyama' })
  name!: string;

  @ApiProperty({ example: 'C' })
  position!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/headshots/nba/latest/260x190/1642868.png' })
  headshotUrl!: string;

  @ApiProperty({ example: 27.7 })
  points!: number;

  @ApiProperty({ example: 1987 })
  pointsTotal!: number;

  @ApiProperty({ example: 12.9 })
  rebounds!: number;

  @ApiProperty({ example: 941 })
  reboundsTotal!: number;

  @ApiProperty({ example: 10.7 })
  assists!: number;

  @ApiProperty({ example: 773 })
  assistsTotal!: number;

  @ApiProperty({ example: 1.2 })
  steals!: number;

  @ApiProperty({ example: 91 })
  stealsTotal!: number;

  @ApiProperty({ example: 0.9 })
  blocks!: number;

  @ApiProperty({ example: 68 })
  blocksTotal!: number;

  @ApiProperty({ example: 72 })
  gamesPlayed!: number;
}

@ApiTags('Teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly db: DatabaseService) {}

  private async findTeam(abbr: string) {
    const rows = await this.db.db.select().from(teams).where(eq(teams.abbreviation, abbr)).limit(1);
    if (rows.length === 0) {
      throw new NotFoundException(`Team '${abbr}' not found`);
    }
    return rows[0];
  }

  @Get()
  @ApiOperation({ summary: 'All 30 NBA teams with 2025-26 stat leaders' })
  @ApiDataResponse(TeamResponse, HttpStatus.OK, 'Teams with leaders.', 'Teams with leaders.')
  async getTeams(): Promise<ApiResponse<TeamResponse[]>> {
    const season = '2025-26';

    // Fetch team metadata
    const allTeams = await this.db.db.select().from(teams);

    // Fetch player stats for leader computation
    const stats = await this.db.db
      .select({
        teamAbbr: players.teamAbbr,
        displayName: players.displayName,
        ptsPerGame: playerSeasonStats.ptsPerGame,
        rebPerGame: playerSeasonStats.rebPerGame,
        astPerGame: playerSeasonStats.astPerGame,
      })
      .from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(
        and(
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
        ),
      );

    // Group stats by team
    const byTeam = new Map<string, typeof stats>();
    for (const r of stats) {
      const abbr = r.teamAbbr ?? '';
      if (!abbr) continue;
      if (!byTeam.has(abbr)) byTeam.set(abbr, []);
      byTeam.get(abbr)!.push(r);
    }

    function topRow(
      rows: typeof stats,
      field: 'ptsPerGame' | 'rebPerGame' | 'astPerGame',
    ): { name: string; value: number } {
      const best = rows
        .filter((r) => r[field] != null)
        .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0];
      return {
        name: best?.displayName ?? '',
        value: Math.round((best?.[field] ?? 0) * 10) / 10,
      };
    }

    const result: TeamResponse[] = allTeams.map((t) => {
      const lookup = ABBR_MAP[t.abbreviation] ?? t.abbreviation;
      const rows = byTeam.get(lookup) ?? [];

      return {
        externalId: Number(t.externalId),
        abbreviation: t.abbreviation,
        teamName: t.name,
        fullName: t.fullName,
        city: t.city,
        conference: t.conference,
        division: t.division,
        logoUrl: t.logoUrl ?? '',
        arena: t.arena ?? '',
        headCoach: t.headCoach ?? '',
        primaryColor: t.primaryColor ?? '',
        leaders:
          rows.length > 0
            ? {
                pts: topRow(rows, 'ptsPerGame'),
                reb: topRow(rows, 'rebPerGame'),
                ast: topRow(rows, 'astPerGame'),
              }
            : null,
      };
    });

    return response(true, 'Teams fetched.', result);
  }

  @Get(':abbr/record')
  @ApiOperation({ summary: 'Team win-loss record for the current season' })
  @ApiDataResponse(TeamRecordResponse, HttpStatus.OK, 'Team record.', 'Team record.')
  async getTeamRecord(@Param('abbr') abbr: string): Promise<ApiResponse<TeamRecordResponse>> {
    const season = '2025-26';

    const team = await this.findTeam(abbr);

    // Schedule tricodes use BKN; teams table uses BRK
    const tricode = abbr === 'BRK' ? 'BKN' : abbr;

    const games = await this.db.db
      .select({
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
      })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(
        and(
          eq(scheduleDays.seasonYear, season),
          eq(scheduleGames.gameStatus, 3),
          eq(scheduleGames.seriesText, ''),
          notInArray(scheduleGames.gameLabel, ['Preseason', 'All-Star', 'All-Star Championship']),
          or(
            eq(scheduleGames.homeTeamTricode, tricode),
            eq(scheduleGames.awayTeamTricode, tricode),
          ),
        ),
      );

    let wins = 0;
    let losses = 0;
    for (const g of games) {
      if (g.homeScore == null || g.awayScore == null) continue;
      const isHome = g.homeTricode === tricode;
      const ours = isHome ? g.homeScore : g.awayScore;
      const theirs = isHome ? g.awayScore : g.homeScore;
      if (ours > theirs) wins += 1;
      else losses += 1;
    }

    // Latest final games with real scores (any phase: regular season, play-in, playoffs)
    const lastRows = await this.db.db
      .select({
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDate: scheduleGames.gameDate,
      })
      .from(scheduleGames)
      .where(
        and(
          eq(scheduleGames.gameStatus, 3),
          sql`${scheduleGames.homeTeamScore} + ${scheduleGames.awayTeamScore} > 0`,
          or(
            eq(scheduleGames.homeTeamTricode, tricode),
            eq(scheduleGames.awayTeamTricode, tricode),
          ),
        ),
      )
      .orderBy(desc(scheduleGames.gameDateTimeUTC))
      .limit(5);

    const lastGames: LastGameResponse[] = lastRows.map((g) => {
      const isHome = g.homeTricode === tricode;
      const ourScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
      const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
      const oppTricode = isHome ? (g.awayTricode ?? '') : (g.homeTricode ?? '');
      return {
        opponentAbbr: ABBR_MAP[oppTricode] ?? oppTricode,
        isHome,
        ourScore,
        oppScore,
        gameDate: g.gameDate,
      };
    });

    return response(true, 'Team record fetched.', {
      wins,
      losses,
      conference: team.conference === 'East' ? 'Eastern Conference' : 'Western Conference',
      division: `${team.division} Division`,
      lastGames,
    });
  }

  @Get(':abbr/games')
  @ApiOperation({ summary: 'Next 5 upcoming games for a team' })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Upcoming games.', 'Upcoming games.', true)
  async getUpcomingGames(@Param('abbr') abbr: string): Promise<ApiResponse<GameResponse[]>> {
    await this.findTeam(abbr);

    // Schedule tricodes use BKN; teams table uses BRK
    const tricode = abbr === 'BRK' ? 'BKN' : abbr;

    const rows = await this.db.db
      .select({
        id: scheduleGames.gameId,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDateTime: scheduleGames.gameDateTimeUTC,
        status: scheduleGames.gameStatusText,
        arenaName: scheduleGames.arenaName,
        arenaCity: scheduleGames.arenaCity,
        arenaState: scheduleGames.arenaState,
      })
      .from(scheduleGames)
      .where(
        and(
          eq(scheduleGames.gameStatus, 1),
          gte(scheduleGames.gameDateTimeUTC, new Date()),
          or(
            eq(scheduleGames.homeTeamTricode, tricode),
            eq(scheduleGames.awayTeamTricode, tricode),
          ),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC))
      .limit(5);

    if (rows.length === 0) {
      return response(true, 'No upcoming games.', []);
    }

    const abbrs = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.homeTricode ?? '', r.awayTricode ?? ''])
          .map((t) => ABBR_MAP[t] ?? t)
          .filter(Boolean),
      ),
    );
    const teamRows = await this.db.db
      .select({ abbreviation: teams.abbreviation, fullName: teams.fullName })
      .from(teams)
      .where(inArray(teams.abbreviation, abbrs));
    const nameByAbbr = new Map(teamRows.map((t) => [t.abbreviation, t.fullName]));

    return response(
      true,
      'Upcoming games fetched.',
      rows.map((g) => ({
        id: g.id,
        homeTeam: teamName(g.homeTricode, nameByAbbr),
        awayTeam: teamName(g.awayTricode, nameByAbbr),
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        gameDateTime: g.gameDateTime?.toISOString() ?? '',
        status: g.status ?? '',
        arenaName: g.arenaName ?? null,
        arenaCity: g.arenaCity ?? null,
        arenaState: g.arenaState ?? null,
      })),
    );
  }

  @Get(':abbr/schedule')
  @ApiOperation({ summary: 'Team schedule for a calendar month (YYYY-MM)' })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Schedule.', 'Schedule.', true)
  async getTeamSchedule(
    @Param('abbr') abbr: string,
    @Query('month') month: string,
  ): Promise<ApiResponse<GameResponse[]>> {
    await this.findTeam(abbr);

    const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
    if (!match) {
      throw new BadRequestException('month must be formatted as YYYY-MM');
    }
    const year = Number(match[1]);
    const monthNum = Number(match[2]);
    if (monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('month must be between 01 and 12');
    }
    const start = new Date(Date.UTC(year, monthNum - 1, 1));
    const end = new Date(Date.UTC(year, monthNum, 1));

    // Schedule tricodes use BKN; teams table uses BRK
    const tricode = abbr === 'BRK' ? 'BKN' : abbr;

    const rows = await this.db.db
      .select({
        id: scheduleGames.gameId,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDateTime: scheduleGames.gameDateTimeUTC,
        status: scheduleGames.gameStatusText,
        arenaName: scheduleGames.arenaName,
        arenaCity: scheduleGames.arenaCity,
        arenaState: scheduleGames.arenaState,
      })
      .from(scheduleGames)
      .where(
        and(
          gte(scheduleGames.gameDateTimeUTC, start),
          lt(scheduleGames.gameDateTimeUTC, end),
          notInArray(scheduleGames.gameLabel, ['Preseason', 'All-Star', 'All-Star Championship']),
          or(
            eq(scheduleGames.homeTeamTricode, tricode),
            eq(scheduleGames.awayTeamTricode, tricode),
          ),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    if (rows.length === 0) {
      return response(true, 'No games this month.', []);
    }

    const abbrs = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.homeTricode ?? '', r.awayTricode ?? ''])
          .map((t) => ABBR_MAP[t] ?? t)
          .filter(Boolean),
      ),
    );
    const teamRows = await this.db.db
      .select({ abbreviation: teams.abbreviation, fullName: teams.fullName })
      .from(teams)
      .where(inArray(teams.abbreviation, abbrs));
    const nameByAbbr = new Map(teamRows.map((t) => [t.abbreviation, t.fullName]));

    return response(
      true,
      'Schedule fetched.',
      rows.map((g) => ({
        id: g.id,
        homeTeam: teamName(g.homeTricode, nameByAbbr),
        awayTeam: teamName(g.awayTricode, nameByAbbr),
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        gameDateTime: g.gameDateTime?.toISOString() ?? '',
        status: g.status ?? '',
        arenaName: g.arenaName ?? null,
        arenaCity: g.arenaCity ?? null,
        arenaState: g.arenaState ?? null,
      })),
    );
  }

  @Get(':abbr/players')
  @ApiOperation({ summary: 'Team players with per-game and total stats' })
  @ApiDataResponse(PlayerStatResponse, HttpStatus.OK, 'Top players.', 'Top players.', true)
  async getTopPlayers(@Param('abbr') abbr: string): Promise<ApiResponse<PlayerStatResponse[]>> {
    await this.findTeam(abbr);

    // Players table uses BKN; teams table uses BRK
    const tricode = abbr === 'BRK' ? 'BKN' : abbr;
    const season = '2025-26';

    // Min-games guard: half the league's most-played games, capped at 20 —
    // keeps the panel populated early in the season, strict once it matures.
    const maxGpRows = await this.db.db
      .select({ maxGp: max(playerSeasonStats.gp) })
      .from(playerSeasonStats)
      .where(
        and(
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
        ),
      );
    const minGp = Math.min(20, Math.max(1, Math.floor((maxGpRows[0]?.maxGp ?? 0) / 2)));

    const rows = await this.db.db
      .select({
        id: players.id,
        externalId: players.externalId,
        firstName: players.firstName,
        lastName: players.lastName,
        displayName: players.displayName,
        position: players.position,
        points: playerSeasonStats.ptsPerGame,
        rebounds: playerSeasonStats.rebPerGame,
        assists: playerSeasonStats.astPerGame,
        pointsTotal: playerSeasonStats.ptsTotal,
        reboundsTotal: playerSeasonStats.rebTotal,
        assistsTotal: playerSeasonStats.astTotal,
        steals: playerSeasonStats.stlPerGame,
        stealsTotal: playerSeasonStats.stlTotal,
        blocks: playerSeasonStats.blkPerGame,
        blocksTotal: playerSeasonStats.blkTotal,
        gamesPlayed: playerSeasonStats.gp,
      })
      .from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(
        and(
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
          eq(players.teamAbbr, tricode),
          gte(playerSeasonStats.gp, minGp),
        ),
      )
      .orderBy(
        desc(
          sql`COALESCE(${playerSeasonStats.ptsPerGame}, 0) + COALESCE(${playerSeasonStats.rebPerGame}, 0) + COALESCE(${playerSeasonStats.astPerGame}, 0)`,
        ),
        desc(playerSeasonStats.ptsPerGame),
      );

    const round1 = (v: number | null) => (v == null ? 0 : Math.round(v * 10) / 10);

    return response(
      true,
      'Top players fetched.',
      rows.map((p) => ({
        id: p.id,
        name: p.displayName ?? `${p.firstName} ${p.lastName}`,
        position: p.position ?? '',
        headshotUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${p.externalId}.png`,
        points: round1(p.points),
        rebounds: round1(p.rebounds),
        assists: round1(p.assists),
        pointsTotal: Math.round(p.pointsTotal ?? 0),
        reboundsTotal: Math.round(p.reboundsTotal ?? 0),
        assistsTotal: Math.round(p.assistsTotal ?? 0),
        steals: round1(p.steals),
        stealsTotal: Math.round(p.stealsTotal ?? 0),
        blocks: round1(p.blocks),
        blocksTotal: Math.round(p.blocksTotal ?? 0),
        gamesPlayed: p.gamesPlayed ?? 0,
      })),
    );
  }
}
