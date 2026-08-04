import { BadGatewayException, Controller, Get, HttpStatus, Logger } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { teams } from '@iknoball/database';
import { inArray } from 'drizzle-orm';

type StandingValue = string | number | null;

class StandingRow {
  @ApiProperty({ example: 1 })
  rank!: number;

  @ApiProperty({ example: 'OKC' })
  teamAbbr!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612760/global/L/logo.svg' })
  logoUrl!: string;

  @ApiProperty({ example: 64 })
  wins!: number;

  @ApiProperty({ example: 18 })
  losses!: number;

  @ApiProperty({ example: 0 })
  gamesBack!: number;

  @ApiProperty({ example: 'w', nullable: true })
  marker!: string | null;
}

class StandingsResponse {
  @ApiProperty({ example: '2025-26' })
  season!: string;

  @ApiProperty({ type: [StandingRow] })
  West!: StandingRow[];

  @ApiProperty({ type: [StandingRow] })
  East!: StandingRow[];
}

@ApiTags('Standings')
@Controller('standings')
export class StandingsController {
  private readonly logger = new Logger(StandingsController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Conference standings with clinch markers' })
  @ApiDataResponse(StandingsResponse, HttpStatus.OK, 'Standings fetched.', 'Standings fetched.')
  async getStandings(): Promise<ApiResponse<StandingsResponse>> {
    const season = process.env.NBA_CURRENT_SEASON ?? '2025-26';
    const cacheKey = `standings:${season}`;
    const cached = (await this.redis.keyExists(cacheKey))
      ? await this.redis.getKey(cacheKey)
      : null;
    if (cached) {
      return response(true, 'Standings fetched.', JSON.parse(cached) as StandingsResponse);
    }

    const raw = await this.fetchStandings(season);
    const standings = await this.buildStandings(raw, season);
    await this.redis.setKey(cacheKey, JSON.stringify(standings), 60 * 30);

    return response(true, 'Standings fetched.', standings);
  }

  private async fetchStandings(season: string): Promise<{
    resultSets: { name: string; headers: string[]; rowSet: StandingValue[][] }[];
  }> {
    const url = new URL(
      `${process.env.NBA_STATS_BASE_URL ?? 'https://stats.nba.com/stats'}/leaguestandingsv3`,
    );
    url.searchParams.set('GroupBy', 'conf');
    url.searchParams.set('LeagueID', '00');
    url.searchParams.set('Season', season);
    url.searchParams.set('SeasonType', 'Regular Season');
    url.searchParams.set('Section', 'overall');

    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      this.logger.error(`stats.nba.com responded ${res.status}`);
      throw new BadGatewayException('Standings source unavailable');
    }
    return res.json();
  }

  private headers(): Record<string, string> {
    return {
      accept: 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': process.env.NBA_STATS_ACCEPT_LANGUAGE || 'en-US,en;q=0.5',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      host: 'stats.nba.com',
      pragma: 'no-cache',
      referer: process.env.NBA_STATS_REFERER || 'https://www.nba.com/',
      'sec-ch-ua':
        process.env.NBA_STATS_SEC_CH_UA ||
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest': 'empty',
      'user-agent':
        process.env.NBA_STATS_USER_AGENT ||
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    };
  }

  private async buildStandings(
    raw: { resultSets: { name: string; headers: string[]; rowSet: StandingValue[][] }[] },
    season: string,
  ): Promise<StandingsResponse> {
    const set = raw.resultSets.find((r) => r.name === 'Standings');
    if (!set) throw new BadGatewayException('Unexpected standings payload');

    const rows: Record<string, StandingValue>[] = set.rowSet.map((values) =>
      Object.fromEntries(set.headers.map((h, i) => [h, values[i]])),
    );

    const teamIds = rows.map((r) => String(r.TeamID));
    const teamRows = await this.db.db
      .select({
        externalId: teams.externalId,
        abbreviation: teams.abbreviation,
        logoUrl: teams.logoUrl,
      })
      .from(teams)
      .where(inArray(teams.externalId, teamIds));
    const teamByExternalId = new Map(teamRows.map((t) => [t.externalId, t]));

    const byConference: Record<'West' | 'East', StandingRow[]> = { West: [], East: [] };
    for (const row of rows) {
      const team = teamByExternalId.get(String(row.TeamID));
      if (!team) continue;
      const conference = row.Conference === 'West' ? 'West' : 'East';
      byConference[conference].push({
        rank: Number(row.PlayoffRank),
        teamAbbr: team.abbreviation,
        logoUrl: team.logoUrl ?? '',
        wins: Number(row.WINS),
        losses: Number(row.LOSSES),
        gamesBack: Number(row.ConferenceGamesBack),
        marker: this.markerFor(row, conference),
      });
    }
    for (const conf of ['West', 'East'] as const) {
      byConference[conf].sort((a, b) => a.rank - b.rank);
    }

    return { season, ...byConference };
  }

  private markerFor(
    row: Record<string, StandingValue>,
    conference: 'West' | 'East',
  ): string | null {
    if (row.ClinchedConferenceTitle === 1) return conference === 'West' ? 'w' : 'e';
    if (row.ClinchedPlayoffBirth === 1) return 'x';
    if (row.ClinchedPlayIn === 1) return 'pi';
    if (row.ClinchedPostSeason === 1) return 'ps';
    if (row.EliminatedConference === 1) return 'o';
    return null;
  }
}
