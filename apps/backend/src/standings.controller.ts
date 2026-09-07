import { setDefaultResultOrder } from 'node:dns';
import { BadGatewayException, Controller, Get, HttpStatus, Logger } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { teams, scheduleDays, scheduleGames } from '@iknoball/database';
import { and, eq, sql, asc } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';

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

async function resolveSeasonStart(db: DatabaseService['db'], season: string): Promise<Date | null> {
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

if (process.env.NBA_STATS_FORCE_IPV4 === 'true') {
  setDefaultResultOrder('ipv4first');
}

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
  private readonly requestTimeoutMs = 4000;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  private async getEffectiveSeason(rawSeason: string): Promise<string> {
    const start = await resolveSeasonStart(this.db.db, rawSeason);
    if (!start || Number.isNaN(start.getTime())) return rawSeason;
    const now = new Date();
    const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 7) return getPreviousSeason(rawSeason);
    return rawSeason;
  }

  @Get()
  @ApiOperation({ summary: 'Conference standings with clinch markers' })
  @ApiDataResponse(StandingsResponse, HttpStatus.OK, 'Standings fetched.', 'Standings fetched.')
  async getStandings(): Promise<ApiResponse<StandingsResponse>> {
    const rawSeason = process.env.NBA_CURRENT_SEASON ?? '2025-26';
    const season = await this.getEffectiveSeason(rawSeason);
    const cacheKey = `standings:${season}`;
    const staleKey = `${cacheKey}:stale`;

    // 1) Try fast cache (30 min)
    try {
      const cached = (await this.redis.keyExists(cacheKey))
        ? await this.redis.getKey(cacheKey)
        : null;
      if (cached) {
        return response(true, 'Standings fetched.', JSON.parse(cached) as StandingsResponse);
      }
    } catch (e) {
      this.logger.warn(`Redis cache read failed for ${cacheKey}: ${(e as Error).message}`);
    }

    // Check stale for fast serve (stale-while-revalidate)
    let stale: string | null = null;
    try {
      stale = (await this.redis.keyExists(staleKey)) ? await this.redis.getKey(staleKey) : null;
    } catch (e) {
      this.logger.warn(`Redis stale read failed: ${(e as Error).message}`);
    }
    if (stale) {
      // Serve stale immediately, refresh in background
      this.refreshStandingsInBackground(season, cacheKey, staleKey).catch((e) =>
        this.logger.warn(`Background refresh failed: ${(e as Error).message}`),
      );
      this.logger.warn(`Serving stale standings for ${season} (background refresh)`);
      return response(true, 'Standings fetched.', JSON.parse(stale) as StandingsResponse);
    }

    // 2) No stale: try upstream fetch (single attempt, short timeout, fast fallback)
    try {
      const raw = await this.fetchStandingsWithTimeout(season);
      const standings = await this.buildStandings(raw, season);
      try {
        await this.redis.setKey(cacheKey, JSON.stringify(standings), 60 * 30);
        await this.redis.setKey(staleKey, JSON.stringify(standings), 60 * 60 * 24 * 7);
      } catch (e) {
        this.logger.warn(`Redis cache write failed: ${(e as Error).message}`);
      }
      return response(true, 'Standings fetched.', standings);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Upstream standings fetch failed (${season}): ${msg}`);

      // 3) Fallback: compute from DB (scheduleGames) — no stale left to try
      try {
        const fallback = await this.buildStandingsFromDb(season);
        try {
          await this.redis.setKey(staleKey, JSON.stringify(fallback), 60 * 60 * 24 * 7);
          await this.redis.setKey(cacheKey, JSON.stringify(fallback), 60 * 5);
        } catch {}
        this.logger.warn(`Serving DB-fallback standings for ${season}`);
        return response(true, 'Standings fetched.', fallback);
      } catch (e) {
        this.logger.error(`DB fallback failed: ${(e as Error).message}`, (e as Error).stack);
      }

      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Standings source unavailable');
    }
  }

  private async refreshStandingsInBackground(season: string, cacheKey: string, staleKey: string) {
    try {
      const raw = await this.fetchStandingsWithTimeout(season);
      const standings = await this.buildStandings(raw, season);
      await this.redis.setKey(cacheKey, JSON.stringify(standings), 60 * 30);
      await this.redis.setKey(staleKey, JSON.stringify(standings), 60 * 60 * 24 * 7);
      this.logger.log(`Background refresh succeeded for ${season}`);
    } catch (e) {
      // fallback to DB if external still failing, keep stale fresh
      try {
        const fallback = await this.buildStandingsFromDb(season);
        await this.redis.setKey(staleKey, JSON.stringify(fallback), 60 * 60 * 24 * 7);
        await this.redis.setKey(cacheKey, JSON.stringify(fallback), 60 * 5);
        this.logger.warn(`Background refresh used DB fallback for ${season}`);
      } catch {}
      throw e;
    }
  }

  private async fetchStandingsWithTimeout(season: string): Promise<{
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`stats.nba.com responded ${res.status}: ${body.slice(0, 500)}`);
        throw new BadGatewayException('Standings source unavailable');
      }
      return (await res.json()) as {
        resultSets: { name: string; headers: string[]; rowSet: StandingValue[][] }[];
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new BadGatewayException('Standings source unavailable (timeout)');
      }
      const m = err.message?.toLowerCase() ?? '';
      if (
        m.includes('timeout') ||
        m.includes('etimedout') ||
        m.includes('econnreset') ||
        m.includes('fetch failed')
      ) {
        throw new BadGatewayException('Standings source unavailable');
      }
      throw new BadGatewayException('Standings source unavailable');
    } finally {
      clearTimeout(timeout);
    }
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
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      origin: 'https://www.nba.com',
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

  private async buildStandingsFromDb(season: string): Promise<StandingsResponse> {
    const allTeams = await this.db.db
      .select({
        abbreviation: teams.abbreviation,
        logoUrl: teams.logoUrl,
        conference: teams.conference,
        externalId: teams.externalId,
      })
      .from(teams);

    // tricode fix: teams uses BRK, schedule uses BKN
    const tricodeForTeam = (abbr: string) => (abbr === 'BRK' ? 'BKN' : abbr);
    const abbrForTricode = (tri: string) => (tri === 'BKN' ? 'BRK' : tri);

    const winsMap = new Map<string, number>();
    const lossesMap = new Map<string, number>();
    for (const t of allTeams) {
      winsMap.set(t.abbreviation, 0);
      lossesMap.set(t.abbreviation, 0);
    }

    // Pull final games for the season (gameStatus = 3, non-preseason) — mirrors TeamsController record filter
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
          sql`${scheduleGames.homeTeamScore} IS NOT NULL AND ${scheduleGames.awayTeamScore} IS NOT NULL`,
          sql`${scheduleGames.homeTeamScore} + ${scheduleGames.awayTeamScore} > 0`,
          sql`${scheduleGames.gameLabel} NOT IN ('Preseason', 'All-Star', 'All-Star Championship')`,
        ),
      );
    for (const g of games) {
      const homeAbbr = abbrForTricode(g.homeTricode ?? '');
      const awayAbbr = abbrForTricode(g.awayTricode ?? '');
      if (!winsMap.has(homeAbbr) || !winsMap.has(awayAbbr)) continue;
      const homeScore = g.homeScore ?? 0;
      const awayScore = g.awayScore ?? 0;
      if (homeScore > awayScore) {
        winsMap.set(homeAbbr, (winsMap.get(homeAbbr) ?? 0) + 1);
        lossesMap.set(awayAbbr, (lossesMap.get(awayAbbr) ?? 0) + 1);
      } else if (awayScore > homeScore) {
        winsMap.set(awayAbbr, (winsMap.get(awayAbbr) ?? 0) + 1);
        lossesMap.set(homeAbbr, (lossesMap.get(homeAbbr) ?? 0) + 1);
      }
    }

    const byConference: Record<'West' | 'East', StandingRow[]> = { West: [], East: [] };
    // For GB: need leader per conference
    const teamsByConf = new Map<'West' | 'East', typeof allTeams>();
    teamsByConf.set('West', []);
    teamsByConf.set('East', []);
    for (const t of allTeams) {
      const conf = t.conference === 'West' ? 'West' : 'East';
      teamsByConf.get(conf)!.push(t);
    }

    for (const conf of ['West', 'East'] as const) {
      const confTeams = teamsByConf.get(conf)!;
      // sort by wins desc, losses asc for ranking, then abbr for stability
      const sorted = [...confTeams].sort((a, b) => {
        const wA = winsMap.get(a.abbreviation) ?? 0;
        const wB = winsMap.get(b.abbreviation) ?? 0;
        if (wB !== wA) return wB - wA;
        const lA = lossesMap.get(a.abbreviation) ?? 0;
        const lB = lossesMap.get(b.abbreviation) ?? 0;
        if (lA !== lB) return lA - lB;
        return a.abbreviation.localeCompare(b.abbreviation);
      });
      const leader = sorted[0];
      const leaderW = leader ? (winsMap.get(leader.abbreviation) ?? 0) : 0;
      const leaderL = leader ? (lossesMap.get(leader.abbreviation) ?? 0) : 0;
      sorted.forEach((t, idx) => {
        const w = winsMap.get(t.abbreviation) ?? 0;
        const l = lossesMap.get(t.abbreviation) ?? 0;
        const gb = idx === 0 ? 0 : (leaderW - w + (l - leaderL)) / 2;
        byConference[conf].push({
          rank: idx + 1,
          teamAbbr: t.abbreviation,
          logoUrl: t.logoUrl ?? '',
          wins: w,
          losses: l,
          gamesBack: gb,
          marker: null,
        });
      });
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
