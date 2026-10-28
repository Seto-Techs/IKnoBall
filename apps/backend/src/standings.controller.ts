import { setDefaultResultOrder } from 'node:dns';
import { Controller, Get, HttpStatus, Logger } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { teams, scheduleDays, scheduleGames } from '@iknoball/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { resolveCurrentSeason } from './common/season';

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

  /** stats.nba.com is slow even when it answers at all, and it is optional here. */
  private readonly markerTimeoutMs = 8000;
  /** Clinch markers do not move once a season is over. */
  private readonly markerTtlSeconds = 60 * 60 * 6;
  /** Back-off after a failed marker fetch, so a dead upstream is not retried per request. */
  private readonly markerRetryTtlSeconds = 60 * 30;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Conference standings with clinch markers' })
  @ApiDataResponse(StandingsResponse, HttpStatus.OK, 'Standings fetched.', 'Standings fetched.')
  async getStandings(): Promise<ApiResponse<StandingsResponse>> {
    const season = await resolveCurrentSeason(this.db.db);

    // Record comes from the same final scores the team-record endpoint reads, so
    // a night's results land as soon as the crawler writes them. stats.nba.com
    // used to own these numbers, cached behind a 7-day stale key: whenever its
    // standings call timed out (routinely) the endpoint kept serving a snapshot
    // from days earlier, and a finished game never appeared in the record.
    const standings = await this.buildStandingsFromDb(season);

    // Clinch markers are the only thing the feed still supplies, and they are
    // cosmetic. They are merged in from cache and refreshed in the background,
    // so they can never delay the response or decide a win-loss total.
    const markers = await this.readClinchMarkers(season);
    if (markers) {
      for (const conf of ['West', 'East'] as const) {
        for (const row of standings[conf]) {
          row.marker = markers.get(row.teamAbbr) ?? null;
        }
      }
    }

    return response(true, 'Standings fetched.', standings);
  }

  /**
   * Cached clinch markers, keyed by team abbreviation.
   *
   * Returns null when the cache is cold and a refresh has just been started; the
   * caller then serves the standings without markers rather than waiting on the
   * feed.
   */
  private async readClinchMarkers(season: string): Promise<Map<string, string> | null> {
    const key = `standings:markers:${season}`;
    try {
      if (await this.redis.keyExists(key)) {
        const raw = await this.redis.getKey(key);
        if (raw) {
          return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
        }
      }
    } catch (e) {
      this.logger.warn(`Clinch marker cache read failed: ${(e as Error).message}`);
    }

    void this.refreshClinchMarkers(season, key);
    return null;
  }

  private async refreshClinchMarkers(season: string, key: string) {
    try {
      const rows = await this.fetchUpstreamStandings(season);
      const teamRows = await this.db.db
        .select({ externalId: teams.externalId, abbreviation: teams.abbreviation })
        .from(teams)
        .where(
          inArray(
            teams.externalId,
            rows.map((row) => String(row.TeamID)),
          ),
        );
      const abbrByExternalId = new Map(teamRows.map((t) => [t.externalId, t.abbreviation]));

      const markers: Record<string, string> = {};
      for (const row of rows) {
        const abbr = abbrByExternalId.get(String(row.TeamID));
        if (!abbr) continue;
        const marker = this.markerFor(row, row.Conference === 'West' ? 'West' : 'East');
        if (marker) {
          markers[abbr] = marker;
        }
      }

      await this.redis.setKey(key, JSON.stringify(markers), this.markerTtlSeconds);
      this.logger.log(
        `Clinch markers refreshed season=${season} teams=${Object.keys(markers).length}`,
      );
    } catch (e) {
      this.logger.warn(`Clinch marker refresh failed season=${season}: ${(e as Error).message}`);
      // Cache the empty result briefly: the standings themselves are unaffected,
      // and an unreachable feed must not be retried on every page load.
      try {
        await this.redis.setKey(key, '{}', this.markerRetryTtlSeconds);
      } catch {}
    }
  }

  private async fetchUpstreamStandings(season: string): Promise<Record<string, StandingValue>[]> {
    const url = new URL(
      `${process.env.NBA_STATS_BASE_URL ?? 'https://stats.nba.com/stats'}/leaguestandingsv3`,
    );
    url.searchParams.set('GroupBy', 'conf');
    url.searchParams.set('LeagueID', '00');
    url.searchParams.set('Season', season);
    url.searchParams.set('SeasonType', 'Regular Season');
    url.searchParams.set('Section', 'overall');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.markerTimeoutMs);
    try {
      const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`stats.nba.com responded ${res.status}: ${body.slice(0, 200)}`);
      }
      const payload = (await res.json()) as {
        resultSets: { name: string; headers: string[]; rowSet: StandingValue[][] }[];
      };
      const set = payload.resultSets.find((r) => r.name === 'Standings');
      if (!set) {
        throw new Error('Unexpected standings payload');
      }
      return set.rowSet.map((values) =>
        Object.fromEntries(set.headers.map((h, i) => [h, values[i]])),
      );
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
