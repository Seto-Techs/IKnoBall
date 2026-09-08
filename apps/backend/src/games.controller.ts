import { BadRequestException, Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { teams, scheduleGames } from '@iknoball/database';
import { and, gte, lt, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

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
          gte(scheduleGames.gameDateTimeUTC, start),
          lt(scheduleGames.gameDateTimeUTC, endExclusive),
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
}
