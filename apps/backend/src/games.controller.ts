import { BadRequestException, Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import {
  teams,
  scheduleDays,
  scheduleGames,
  scheduleBoxscoreSummaries,
  scheduleBoxscoreTeams,
  scheduleBoxscorePlayers,
  players,
} from '@iknoball/database';
import { and, gte, lt, lte, asc, desc, eq, inArray, notInArray, or } from 'drizzle-orm';

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

/**
 * The NBA feed reports minutes as an ISO-8601 duration ("PT34M21.00S"). Turn it
 * into the "34:21" a box score shows. Unrecognised input passes through.
 */
function formatMinutes(value: string | null): string | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim());
  if (!match) return value;
  const mins = Number(match[1] ?? 0);
  const secs = Math.round(Number(match[2] ?? 0));
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** '2026-27' -> '2025-26'. Returns the input unchanged if it is not YYYY-YY. */
function previousSeason(season: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  const start = parseInt(m[1], 10) - 1;
  return `${start}-${String(start + 1)
    .slice(-2)
    .padStart(2, '0')}`;
}

function teamName(tricode: string | null, byAbbr: Map<string, string>): string {
  const abbr = ABBR_MAP[tricode ?? ''] ?? tricode ?? '';
  return byAbbr.get(abbr) ?? abbr;
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

  @ApiProperty({ example: '2026-06-16' })
  gameDate!: string;

  @ApiProperty({ example: 'BKN' })
  homeTricode!: string | null;

  @ApiProperty({ example: 'NYK' })
  awayTricode!: string | null;

  @ApiProperty({
    example: '',
    nullable: true,
    description: 'Season context: ""=Regular Season, "Preseason", playoff round, etc.',
  })
  gameLabel!: string | null;

  @ApiProperty({ example: null, nullable: true })
  gameSubLabel!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Playoff series text, e.g. "GSW leads 2-1"',
  })
  seriesText!: string | null;
}

class SeriesTeam {
  @ApiProperty({ example: 'ATL' })
  tricode!: string;

  @ApiProperty({ example: 'Atlanta Hawks' })
  team!: string;

  @ApiProperty({ example: 2 })
  wins!: number;

  @ApiProperty({ example: 0 })
  losses!: number;
}

class SeriesMeeting {
  @ApiProperty({ example: '0022500623' })
  id!: string;

  @ApiProperty({ example: '2026-01-21' })
  gameDate!: string;

  @ApiProperty({ example: 'MEM', nullable: true })
  homeTricode!: string | null;

  @ApiProperty({ example: 'ATL', nullable: true })
  awayTricode!: string | null;

  @ApiProperty({ example: 'Memphis Grizzlies' })
  homeTeam!: string;

  @ApiProperty({ example: 'Atlanta Hawks' })
  awayTeam!: string;

  @ApiProperty({ example: 122, nullable: true })
  homeScore!: number | null;

  @ApiProperty({ example: 124, nullable: true })
  awayScore!: number | null;
}

class HeadToHeadResponse {
  @ApiProperty({ example: '2025-26', description: 'The prior season this series is from' })
  season!: string;

  @ApiProperty({ type: SeriesTeam, description: "Current game's home team" })
  home!: SeriesTeam;

  @ApiProperty({ type: SeriesTeam, description: "Current game's away team" })
  away!: SeriesTeam;

  @ApiProperty({ type: [SeriesMeeting] })
  meetings!: SeriesMeeting[];
}

class BoxScoreStatsResponse {
  @ApiProperty({ example: '34:21', nullable: true, description: 'Minutes played, "MM:SS"' })
  minutes!: string | null;

  @ApiProperty({ example: 8, nullable: true })
  fgMade!: number | null;

  @ApiProperty({ example: 16, nullable: true })
  fgAttempted!: number | null;

  @ApiProperty({ example: 0.5, nullable: true })
  fgPct!: number | null;

  @ApiProperty({ example: 6, nullable: true })
  fg3Made!: number | null;

  @ApiProperty({ example: 11, nullable: true })
  fg3Attempted!: number | null;

  @ApiProperty({ example: 0.545, nullable: true })
  fg3Pct!: number | null;

  @ApiProperty({ example: 2, nullable: true })
  ftMade!: number | null;

  @ApiProperty({ example: 4, nullable: true })
  ftAttempted!: number | null;

  @ApiProperty({ example: 0.5, nullable: true })
  ftPct!: number | null;

  @ApiProperty({ example: 2, nullable: true })
  oreb!: number | null;

  @ApiProperty({ example: 5, nullable: true })
  dreb!: number | null;

  @ApiProperty({ example: 7, nullable: true })
  reb!: number | null;

  @ApiProperty({ example: 6, nullable: true })
  ast!: number | null;

  @ApiProperty({ example: 0, nullable: true })
  stl!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  blk!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  tov!: number | null;

  @ApiProperty({ example: 5, nullable: true })
  pf!: number | null;

  @ApiProperty({ example: 24, nullable: true })
  pts!: number | null;

  @ApiProperty({ example: 14, nullable: true })
  plusMinus!: number | null;
}

class BoxScorePlayerResponse extends BoxScoreStatsResponse {
  @ApiProperty({ example: 'clx...' })
  playerId!: string;

  @ApiProperty({ example: '1642868', description: 'NBA person id' })
  externalId!: string;

  @ApiProperty({ example: 'Miles Kelly' })
  name!: string;

  @ApiProperty({ example: '11', nullable: true })
  jersey!: string | null;

  @ApiProperty({ example: 'G', nullable: true })
  position!: string | null;

  @ApiProperty({ example: 'https://cdn.nba.com/headshots/nba/latest/260x190/1642868.png' })
  headshotUrl!: string;

  @ApiProperty({
    example: true,
    description: 'In the starting five. Null when the game predates starter capture.',
    nullable: true,
  })
  starter!: boolean | null;
}

class BoxScorePeriodResponse {
  @ApiProperty({ example: 1 })
  period!: number;

  @ApiProperty({ example: 'REGULAR', description: 'REGULAR or OVERTIME' })
  periodType!: string;

  @ApiProperty({ example: 36 })
  score!: number;
}

class BoxScoreSideResponse {
  @ApiProperty({ example: 1610612744 })
  teamId!: number;

  @ApiProperty({ example: 'GSW' })
  tricode!: string;

  @ApiProperty({ example: 'Golden State Warriors' })
  teamName!: string;

  @ApiProperty({ example: 118, nullable: true })
  score!: number | null;

  @ApiProperty({ type: [BoxScorePeriodResponse] })
  periods!: BoxScorePeriodResponse[];

  @ApiProperty({ type: BoxScoreStatsResponse })
  stats!: BoxScoreStatsResponse;

  @ApiProperty({
    type: [BoxScorePlayerResponse],
    description: 'In the feed order: starters first, then the bench.',
  })
  players!: BoxScorePlayerResponse[];
}

class BoxScoreResponse {
  @ApiProperty({ example: '0012600033' })
  gameId!: string;

  @ApiProperty({ example: 3, description: '2 = live, 3 = final' })
  status!: number;

  @ApiProperty({ example: 'Final' })
  statusText!: string;

  @ApiProperty({ example: 4 })
  period!: number;

  @ApiProperty({ example: 'PT00M00.00S' })
  gameClock!: string;

  @ApiProperty({ type: BoxScoreSideResponse, description: "The game's home team" })
  home!: BoxScoreSideResponse;

  @ApiProperty({ type: BoxScoreSideResponse, description: "The game's away team" })
  away!: BoxScoreSideResponse;
}

@ApiTags('Games')
@Controller('games')
export class GamesController {
  constructor(private readonly db: DatabaseService) {}

  private async mapNames(rows: { homeTricode: string | null; awayTricode: string | null }[]) {
    const abbrs = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.homeTricode ?? '', r.awayTricode ?? ''])
          .map((t) => ABBR_MAP[t] ?? t)
          .filter(Boolean),
      ),
    );
    if (abbrs.length === 0) return new Map<string, string>();
    const teamRows = await this.db.db
      .select({ abbreviation: teams.abbreviation, fullName: teams.fullName })
      .from(teams)
      .where(inArray(teams.abbreviation, abbrs));
    return new Map(teamRows.map((t) => [t.abbreviation, t.fullName]));
  }

  private toResponse(
    g: {
      id: string;
      homeTricode: string | null;
      awayTricode: string | null;
      homeScore: number | null;
      awayScore: number | null;
      gameDateTime: Date | null;
      status: string | null;
      arenaName: string | null;
      arenaCity: string | null;
      arenaState: string | null;
      gameDate: string;
      gameLabel?: string | null;
      gameSubLabel?: string | null;
      seriesText?: string | null;
    },
    nameByAbbr: Map<string, string>,
  ): GameResponse {
    return {
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
      gameDate: g.gameDate,
      homeTricode: g.homeTricode ? (ABBR_MAP[g.homeTricode] ?? g.homeTricode) : g.homeTricode,
      awayTricode: g.awayTricode ? (ABBR_MAP[g.awayTricode] ?? g.awayTricode) : g.awayTricode,
      gameLabel: (g as { gameLabel?: string | null }).gameLabel ?? null,
      gameSubLabel: (g as { gameSubLabel?: string | null }).gameSubLabel ?? null,
      seriesText: (g as { seriesText?: string | null }).seriesText ?? null,
    };
  }

  @Get('next')
  @ApiOperation({
    summary: 'Games on the nearest future date with scheduled games (opening day fallback)',
  })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Next games.', 'Next games.', true)
  async getNext(): Promise<ApiResponse<GameResponse[]>> {
    const now = new Date();
    // Include Preseason by default (differentiated via badge) — only All-Star excluded
    const nextRow = await this.db.db
      .select({
        gameDate: scheduleGames.gameDate,
        gameDateTime: scheduleGames.gameDateTimeUTC,
      })
      .from(scheduleGames)
      .where(
        and(
          gte(scheduleGames.gameDateTimeUTC, now),
          notInArray(scheduleGames.gameLabel, ['All-Star', 'All-Star Championship']),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC))
      .limit(1);

    if (nextRow.length === 0) {
      return response(true, 'No upcoming games.', []);
    }

    const nextDate = nextRow[0].gameDate;
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
        gameDate: scheduleGames.gameDate,
        gameLabel: scheduleGames.gameLabel,
        gameSubLabel: scheduleGames.gameSubLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .where(
        and(
          eq(scheduleGames.gameDate, nextDate),
          notInArray(scheduleGames.gameLabel, ['All-Star', 'All-Star Championship']),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    if (rows.length === 0) {
      return response(true, 'No upcoming games.', []);
    }

    const nameByAbbr = await this.mapNames(rows);
    return response(
      true,
      'Next games fetched.',
      rows.map((g) => this.toResponse(g, nameByAbbr)),
    );
  }

  @Get('previous')
  @ApiOperation({ summary: 'Most recent game day before today with final results (gap-agnostic)' })
  @ApiDataResponse(
    GameResponse,
    HttpStatus.OK,
    'Previous game day results.',
    'Previous game day results.',
    true,
  )
  async getPrevious(): Promise<ApiResponse<GameResponse[]>> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const excludeLabels = ['All-Star', 'All-Star Championship'] as const;

    // Prefer the most recent date with a Final (gameStatus = 3); fallback to any scheduled date before today.
    let prevDateRow = await this.db.db
      .select({ gameDate: scheduleGames.gameDate })
      .from(scheduleGames)
      .where(
        and(
          lt(scheduleGames.gameDate, todayStr),
          eq(scheduleGames.gameStatus, 3),
          notInArray(scheduleGames.gameLabel, [...excludeLabels]),
        ),
      )
      .orderBy(desc(scheduleGames.gameDate))
      .limit(1);

    if (prevDateRow.length === 0) {
      prevDateRow = await this.db.db
        .select({ gameDate: scheduleGames.gameDate })
        .from(scheduleGames)
        .where(
          and(
            lt(scheduleGames.gameDate, todayStr),
            notInArray(scheduleGames.gameLabel, [...excludeLabels]),
          ),
        )
        .orderBy(desc(scheduleGames.gameDate))
        .limit(1);
    }

    if (prevDateRow.length === 0) {
      return response(true, 'No previous games.', []);
    }

    const prevDate = prevDateRow[0].gameDate;

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
        gameDate: scheduleGames.gameDate,
        gameLabel: scheduleGames.gameLabel,
        gameSubLabel: scheduleGames.gameSubLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .where(
        and(
          eq(scheduleGames.gameDate, prevDate),
          notInArray(scheduleGames.gameLabel, [...excludeLabels]),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    if (rows.length === 0) {
      return response(true, 'No previous games.', []);
    }

    const nameByAbbr = await this.mapNames(rows);
    return response(
      true,
      'Previous games fetched.',
      rows.map((g) => this.toResponse(g, nameByAbbr)),
    );
  }

  @Get('today')
  @ApiOperation({ summary: 'All games scheduled for today (UTC)' })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Games for today.', 'Games for today.', true)
  async getToday(): Promise<ApiResponse<GameResponse[]>> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

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
        gameDate: scheduleGames.gameDate,
        gameLabel: scheduleGames.gameLabel,
        gameSubLabel: scheduleGames.gameSubLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .where(
        and(
          gte(scheduleGames.gameDateTimeUTC, start),
          lt(scheduleGames.gameDateTimeUTC, end),
          notInArray(scheduleGames.gameLabel, ['All-Star', 'All-Star Championship']),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    if (rows.length === 0) {
      return response(true, 'No games today.', []);
    }

    const nameByAbbr = await this.mapNames(rows);
    return response(
      true,
      'Games for today fetched.',
      rows.map((g) => this.toResponse(g, nameByAbbr)),
    );
  }

  @Get('range')
  @ApiOperation({ summary: 'Games in a date range inclusive [from,to] YYYY-MM-DD' })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Games in range.', 'Games in range.', true)
  async getRange(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<ApiResponse<GameResponse[]>> {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(from ?? '') || !re.test(to ?? '')) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    const start = new Date(`${from}T00:00:00.000Z`);
    const endExclusive = new Date(`${to}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (start > endExclusive) {
      throw new BadRequestException('from must be <= to');
    }
    // guard range size 31 days max
    const diffDays = (endExclusive.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 31) {
      throw new BadRequestException('Range too large (max 31 days)');
    }

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
        gameDate: scheduleGames.gameDate,
        gameLabel: scheduleGames.gameLabel,
        gameSubLabel: scheduleGames.gameSubLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .where(
        and(
          // Match on the schedule's own calendar date, not the UTC timestamp.
          // A game tipping 8:00 PM ET on the last day is 00:00 UTC the next day,
          // so a UTC-timestamp window drops it from its own date.
          gte(scheduleGames.gameDate, from),
          lte(scheduleGames.gameDate, to),
          notInArray(scheduleGames.gameLabel, ['All-Star', 'All-Star Championship']),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    if (rows.length === 0) {
      return response(true, 'No games in range.', []);
    }

    const nameByAbbr = await this.mapNames(rows);
    return response(
      true,
      'Games in range fetched.',
      rows.map((g) => this.toResponse(g, nameByAbbr)),
    );
  }

  @Get(':id/head-to-head')
  @ApiOperation({
    summary: 'Regular-season series between the two teams, from the season before the game',
  })
  @ApiDataResponse(HeadToHeadResponse, HttpStatus.OK, 'Head to head.', 'Head to head.')
  async getHeadToHead(@Param('id') id: string): Promise<ApiResponse<HeadToHeadResponse>> {
    const gameRows = await this.db.db
      .select({
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        seasonYear: scheduleDays.seasonYear,
      })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(eq(scheduleGames.gameId, id))
      .limit(1);

    if (gameRows.length === 0) {
      return response<HeadToHeadResponse>(true, 'Game not found.', null);
    }

    const { homeTricode, awayTricode, seasonYear } = gameRows[0];
    const season = previousSeason(seasonYear);

    // Regular season only: gameLabel '' excludes preseason and All-Star, and
    // seriesText '' excludes the play-in/playoffs.
    const rows = await this.db.db
      .select({
        id: scheduleGames.gameId,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDate: scheduleGames.gameDate,
        gameDateTime: scheduleGames.gameDateTimeUTC,
      })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(
        and(
          eq(scheduleDays.seasonYear, season),
          eq(scheduleGames.gameStatus, 3),
          eq(scheduleGames.gameLabel, ''),
          eq(scheduleGames.seriesText, ''),
          or(
            and(
              eq(scheduleGames.homeTeamTricode, homeTricode ?? ''),
              eq(scheduleGames.awayTeamTricode, awayTricode ?? ''),
            ),
            and(
              eq(scheduleGames.homeTeamTricode, awayTricode ?? ''),
              eq(scheduleGames.awayTeamTricode, homeTricode ?? ''),
            ),
          ),
        ),
      )
      .orderBy(asc(scheduleGames.gameDateTimeUTC));

    let homeWins = 0;
    let awayWins = 0;
    for (const g of rows) {
      if (g.homeScore == null || g.awayScore == null) continue;
      // The current game's home team is not necessarily the home side in the series.
      const homeSideIsCurrentHome = g.homeTricode === homeTricode;
      const currentHomeScore = homeSideIsCurrentHome ? g.homeScore : g.awayScore;
      const currentAwayScore = homeSideIsCurrentHome ? g.awayScore : g.homeScore;
      if (currentHomeScore > currentAwayScore) homeWins += 1;
      else awayWins += 1;
    }

    const nameByAbbr = await this.mapNames(rows);
    const canonical = (t: string | null) => (t ? (ABBR_MAP[t] ?? t) : '');

    return response(true, 'Head to head fetched.', {
      season,
      home: {
        tricode: canonical(homeTricode),
        team: teamName(homeTricode, nameByAbbr),
        wins: homeWins,
        losses: awayWins,
      },
      away: {
        tricode: canonical(awayTricode),
        team: teamName(awayTricode, nameByAbbr),
        wins: awayWins,
        losses: homeWins,
      },
      meetings: rows.map((g) => ({
        id: g.id,
        gameDate: g.gameDate,
        homeTricode: g.homeTricode ? canonical(g.homeTricode) : null,
        awayTricode: g.awayTricode ? canonical(g.awayTricode) : null,
        homeTeam: teamName(g.homeTricode, nameByAbbr),
        awayTeam: teamName(g.awayTricode, nameByAbbr),
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      })),
    });
  }

  private mapBoxStats(row: Partial<{
    minutes: string | null;
    fgMade: number | null;
    fgAttempted: number | null;
    fgPct: number | null;
    fg3Made: number | null;
    fg3Attempted: number | null;
    fg3Pct: number | null;
    ftMade: number | null;
    ftAttempted: number | null;
    ftPct: number | null;
    oreb: number | null;
    dreb: number | null;
    reb: number | null;
    ast: number | null;
    stl: number | null;
    blk: number | null;
    tov: number | null;
    pf: number | null;
    pts: number | null;
    plusMinus: number | null;
  }>): BoxScoreStatsResponse {
    return {
      minutes: formatMinutes(row.minutes ?? null),
      fgMade: row.fgMade ?? null,
      fgAttempted: row.fgAttempted ?? null,
      fgPct: row.fgPct ?? null,
      fg3Made: row.fg3Made ?? null,
      fg3Attempted: row.fg3Attempted ?? null,
      fg3Pct: row.fg3Pct ?? null,
      ftMade: row.ftMade ?? null,
      ftAttempted: row.ftAttempted ?? null,
      ftPct: row.ftPct ?? null,
      oreb: row.oreb ?? null,
      dreb: row.dreb ?? null,
      reb: row.reb ?? null,
      ast: row.ast ?? null,
      stl: row.stl ?? null,
      blk: row.blk ?? null,
      tov: row.tov ?? null,
      pf: row.pf ?? null,
      pts: row.pts ?? null,
      plusMinus: row.plusMinus ?? null,
    };
  }

  /** Period scores are jsonb; guard the shape before handing them to the client. */
  private mapPeriods(value: unknown): BoxScorePeriodResponse[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => entry as { period?: number; periodType?: string; score?: number })
      .filter((entry) => typeof entry?.period === 'number')
      .map((entry) => ({
        period: entry.period as number,
        periodType: entry.periodType ?? 'REGULAR',
        score: entry.score ?? 0,
      }));
  }

  @Get(':id/boxscore')
  @ApiOperation({ summary: 'Team totals and the full per-player box score for a game' })
  @ApiDataResponse(BoxScoreResponse, HttpStatus.OK, 'Box score.', 'Box score.')
  async getBoxScore(@Param('id') id: string): Promise<ApiResponse<BoxScoreResponse>> {
    const [game] = await this.db.db
      .select({
        scheduleGameId: scheduleGames.id,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
      })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, id))
      .limit(1);

    if (!game) {
      return response<BoxScoreResponse>(true, 'Game not found.', null);
    }

    const [summary] = await this.db.db
      .select({
        gameStatus: scheduleBoxscoreSummaries.gameStatus,
        gameStatusText: scheduleBoxscoreSummaries.gameStatusText,
        period: scheduleBoxscoreSummaries.period,
        gameClock: scheduleBoxscoreSummaries.gameClock,
        homeTeamId: scheduleBoxscoreSummaries.homeTeamId,
        awayTeamId: scheduleBoxscoreSummaries.awayTeamId,
        homeScore: scheduleBoxscoreSummaries.homeScore,
        awayScore: scheduleBoxscoreSummaries.awayScore,
        homePeriods: scheduleBoxscoreSummaries.homePeriods,
        awayPeriods: scheduleBoxscoreSummaries.awayPeriods,
      })
      .from(scheduleBoxscoreSummaries)
      .where(eq(scheduleBoxscoreSummaries.scheduleGameId, game.scheduleGameId))
      .limit(1);

    if (!summary) {
      return response<BoxScoreResponse>(true, 'No box score for this game.', null);
    }

    const teamRows = await this.db.db
      .select()
      .from(scheduleBoxscoreTeams)
      .where(eq(scheduleBoxscoreTeams.scheduleGameId, game.scheduleGameId));

    // Feed order (starters first, then bench) so a live box score can list the
    // players the way the feed presents them.
    const playerRows = await this.db.db
      .select({
        playerId: scheduleBoxscorePlayers.playerId,
        externalId: scheduleBoxscorePlayers.playerExternalId,
        teamExternalId: scheduleBoxscorePlayers.teamExternalId,
        starter: scheduleBoxscorePlayers.starter,
        displayName: players.displayName,
        firstName: players.firstName,
        lastName: players.lastName,
        jersey: players.jersey,
        position: players.position,
        minutes: scheduleBoxscorePlayers.minutes,
        fgMade: scheduleBoxscorePlayers.fgMade,
        fgAttempted: scheduleBoxscorePlayers.fgAttempted,
        fgPct: scheduleBoxscorePlayers.fgPct,
        fg3Made: scheduleBoxscorePlayers.fg3Made,
        fg3Attempted: scheduleBoxscorePlayers.fg3Attempted,
        fg3Pct: scheduleBoxscorePlayers.fg3Pct,
        ftMade: scheduleBoxscorePlayers.ftMade,
        ftAttempted: scheduleBoxscorePlayers.ftAttempted,
        ftPct: scheduleBoxscorePlayers.ftPct,
        oreb: scheduleBoxscorePlayers.oreb,
        dreb: scheduleBoxscorePlayers.dreb,
        reb: scheduleBoxscorePlayers.reb,
        ast: scheduleBoxscorePlayers.ast,
        stl: scheduleBoxscorePlayers.stl,
        blk: scheduleBoxscorePlayers.blk,
        tov: scheduleBoxscorePlayers.tov,
        pf: scheduleBoxscorePlayers.pf,
        pts: scheduleBoxscorePlayers.pts,
        plusMinus: scheduleBoxscorePlayers.plusMinus,
      })
      .from(scheduleBoxscorePlayers)
      .innerJoin(players, eq(scheduleBoxscorePlayers.playerId, players.id))
      .where(eq(scheduleBoxscorePlayers.scheduleGameId, game.scheduleGameId))
      .orderBy(asc(scheduleBoxscorePlayers.displayOrder));

    const playersByTeam = new Map<number, BoxScorePlayerResponse[]>();
    for (const row of playerRows) {
      const list = playersByTeam.get(row.teamExternalId) ?? [];
      list.push({
        playerId: row.playerId,
        externalId: row.externalId,
        name: row.displayName ?? `${row.firstName} ${row.lastName}`.trim(),
        jersey: row.jersey ?? null,
        position: row.position ?? null,
        headshotUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${row.externalId}.png`,
        starter: row.starter ?? null,
        ...this.mapBoxStats(row),
      });
      playersByTeam.set(row.teamExternalId, list);
    }

    const teamBySide = new Map(teamRows.map((row) => [row.side, row]));
    const nameByAbbr = await this.mapNames([
      { homeTricode: game.homeTricode, awayTricode: game.awayTricode },
    ]);
    const canonical = (t: string | null) => (t ? (ABBR_MAP[t] ?? t) : '');

    const side = (
      which: 'home' | 'away',
      teamId: number,
      tricode: string | null,
      score: number | null,
      periods: unknown,
    ): BoxScoreSideResponse => ({
      teamId,
      tricode: canonical(tricode),
      teamName: teamName(tricode, nameByAbbr),
      score,
      periods: this.mapPeriods(periods),
      stats: this.mapBoxStats(teamBySide.get(which) ?? {}),
      players: playersByTeam.get(teamId) ?? [],
    });

    return response(true, 'Box score fetched.', {
      gameId: id,
      status: summary.gameStatus,
      statusText: summary.gameStatusText,
      period: summary.period,
      gameClock: summary.gameClock ?? '',
      home: side(
        'home',
        summary.homeTeamId,
        game.homeTricode,
        summary.homeScore,
        summary.homePeriods,
      ),
      away: side(
        'away',
        summary.awayTeamId,
        game.awayTricode,
        summary.awayScore,
        summary.awayPeriods,
      ),
    });
  }

  // NOTE: keep this last — the static routes above (next/previous/today/range)
  // must be registered before the ':id' wildcard or they would be captured by it.
  @Get(':id')
  @ApiOperation({ summary: 'A single game by its NBA game id' })
  @ApiDataResponse(GameResponse, HttpStatus.OK, 'Game detail.', 'Game detail.')
  async getById(@Param('id') id: string): Promise<ApiResponse<GameResponse>> {
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
        gameDate: scheduleGames.gameDate,
        gameLabel: scheduleGames.gameLabel,
        gameSubLabel: scheduleGames.gameSubLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, id))
      .limit(1);

    if (rows.length === 0) {
      return response<GameResponse>(true, 'Game not found.', null);
    }

    const nameByAbbr = await this.mapNames(rows);
    return response(true, 'Game fetched.', this.toResponse(rows[0], nameByAbbr));
  }
}
