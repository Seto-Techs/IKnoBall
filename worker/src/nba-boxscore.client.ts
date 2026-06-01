import { Injectable, Logger } from '@nestjs/common';
import { setDefaultResultOrder } from 'node:dns';

export type BoxScoreTraditionalResponse = {
  meta: {
    version: number;
    request: string;
    time: string;
  };
  boxScoreTraditional: {
    gameId: string;
    awayTeamId: number;
    homeTeamId: number;
    homeTeam: {
      teamId: number;
      players: Array<{
        personId: number;
        firstName?: string;
        familyName?: string;
        nameI?: string;
        playerSlug?: string;
        position?: string;
        jerseyNum?: string;
        statistics: {
          minutes: string;
          fieldGoalsMade: number;
          fieldGoalsAttempted: number;
          fieldGoalsPercentage: number;
          threePointersMade: number;
          threePointersAttempted: number;
          threePointersPercentage: number;
          freeThrowsMade: number;
          freeThrowsAttempted: number;
          freeThrowsPercentage: number;
          reboundsOffensive: number;
          reboundsDefensive: number;
          reboundsTotal: number;
          assists: number;
          steals: number;
          blocks: number;
          turnovers: number;
          foulsPersonal: number;
          points: number;
          plusMinusPoints: number;
        };
      }>;
      statistics: {
        minutes: string;
        fieldGoalsMade: number;
        fieldGoalsAttempted: number;
        fieldGoalsPercentage: number;
        threePointersMade: number;
        threePointersAttempted: number;
        threePointersPercentage: number;
        freeThrowsMade: number;
        freeThrowsAttempted: number;
        freeThrowsPercentage: number;
        reboundsOffensive: number;
        reboundsDefensive: number;
        reboundsTotal: number;
        assists: number;
        steals: number;
        blocks: number;
        turnovers: number;
        foulsPersonal: number;
        points: number;
        plusMinusPoints: number;
      };
    };
    awayTeam: {
      teamId: number;
      players: Array<{
        personId: number;
        firstName?: string;
        familyName?: string;
        nameI?: string;
        playerSlug?: string;
        position?: string;
        jerseyNum?: string;
        statistics: {
          minutes: string;
          fieldGoalsMade: number;
          fieldGoalsAttempted: number;
          fieldGoalsPercentage: number;
          threePointersMade: number;
          threePointersAttempted: number;
          threePointersPercentage: number;
          freeThrowsMade: number;
          freeThrowsAttempted: number;
          freeThrowsPercentage: number;
          reboundsOffensive: number;
          reboundsDefensive: number;
          reboundsTotal: number;
          assists: number;
          steals: number;
          blocks: number;
          turnovers: number;
          foulsPersonal: number;
          points: number;
          plusMinusPoints: number;
        };
      }>;
      statistics: {
        minutes: string;
        fieldGoalsMade: number;
        fieldGoalsAttempted: number;
        fieldGoalsPercentage: number;
        threePointersMade: number;
        threePointersAttempted: number;
        threePointersPercentage: number;
        freeThrowsMade: number;
        freeThrowsAttempted: number;
        freeThrowsPercentage: number;
        reboundsOffensive: number;
        reboundsDefensive: number;
        reboundsTotal: number;
        assists: number;
        steals: number;
        blocks: number;
        turnovers: number;
        foulsPersonal: number;
        points: number;
        plusMinusPoints: number;
      };
    };
  };
};

export type BoxScoreSummaryResponse = {
  meta: {
    version: number;
    request: string;
    time: string;
  };
  boxScoreSummary: {
    gameId: string;
    gameCode: string;
    gameStatus: number;
    gameStatusText: string;
    period: number;
    gameClock: string;
    gameTimeUTC: string;
    gameEt: string;
    awayTeamId: number;
    homeTeamId: number;
    duration: string;
    attendance: number;
    sellout: number;
    seriesGameNumber: string;
    gameLabel: string;
    gameSubLabel: string;
    seriesText: string;
    ifNecessary: boolean;
    isNeutral: boolean;
    arena: {
      arenaId: number;
      arenaName: string;
      arenaCity: string;
      arenaState: string;
      arenaCountry: string;
      arenaTimezone: string;
      arenaStreetAddress: string;
      arenaPostalCode: string;
    };
    homeTeam: {
      teamId: number;
      teamName?: string;
      teamCity?: string;
      teamTricode?: string;
      teamSlug?: string;
      teamWins?: number;
      teamLosses?: number;
      score: number;
      inBonus: string;
      timeoutsRemaining: number;
      seed: number;
      periods: Array<{
        period: number;
        periodType: string;
        score: number;
      }>;
      players: Array<{
        personId: number;
        name: string;
        nameI: string;
        firstName: string;
        familyName: string;
        jerseyNum: string;
      }>;
      inactives: Array<unknown>;
    };
    awayTeam: {
      teamId: number;
      teamName: string;
      teamCity: string;
      teamTricode: string;
      teamSlug: string;
      teamWins: number;
      teamLosses: number;
      score: number;
      inBonus: string;
      timeoutsRemaining: number;
      seed: number;
      statistics: {
        dummyKey: string;
      };
      periods: Array<{
        period: number;
        periodType: string;
        score: number;
      }>;
      players: Array<{
        personId: number;
        name: string;
        nameI: string;
        firstName: string;
        familyName: string;
        jerseyNum: string;
      }>;
      inactives: Array<{
        personId: number;
        firstName: string;
        familyName: string;
        jerseyNum: string;
      }>;
    };
    lastFiveMeetings: {
      meetings: Array<{
        recencyOrder: number;
        gameId: string;
        gameTimeUTC: string;
        gameEt: string;
        gameStatus: number;
        gameStatusText: string;
        gameClock: string;
        broadcasterVideoLink: string;
        awayTeam: {
          teamId: number;
          teamCity: string;
          teamName: string;
          teamTricode: string;
          teamSlug: string;
          score: number;
          wins: number;
          losses: number;
        };
        homeTeam: {
          teamId: number;
          teamCity: string;
          teamName: string;
          teamTricode: string;
          teamSlug: string;
          score: number;
          wins: number;
          losses: number;
        };
      }>;
    };
    pregameCharts: {
      homeTeam: {
        teamId: number;
        teamCity: string;
        teamName: string;
        teamTricode: string;
        statistics: Record<string, unknown>;
      };
      awayTeam: {
        teamId: number;
        teamCity: string;
        teamName: string;
        teamTricode: string;
        statistics: Record<string, unknown>;
      };
    };
    postgameCharts: {
      homeTeam: {
        teamId: number;
        teamCity: string;
        teamName: string;
        teamTricode: string;
        statistics: Record<string, unknown>;
      };
      awayTeam: {
        teamId: number;
        teamCity: string;
        teamName: string;
        teamTricode: string;
        statistics: Record<string, unknown>;
      };
    };
    videoAvailableFlag: number;
    ptAvailable: number;
    ptXYZAvailable: number;
    whStatus: number;
    hustleStatus: number;
    historicalStatus: number;
    gameSubtype: string;
  };
};

export type PlayerInfoResponse = {
  resultSets: Array<{
    name: string;
    headers: string[];
    rowSet: unknown[][];
  }>;
};

@Injectable()
export class NbaBoxScoreClient {
  private readonly logger = new Logger(NbaBoxScoreClient.name);
  private readonly baseUrl = process.env.NBA_STATS_BASE_URL || 'https://stats.nba.com/stats';
  private readonly requestTimeoutMs = 15000;
  private readonly forceIpv4 = process.env.NBA_STATS_FORCE_IPV4 === 'true';
  private readonly ipv4Configured = this.configureIpv4();

  async fetchBoxScoreTraditional(gameId: string): Promise<BoxScoreTraditionalResponse> {
    const url = new URL(`${this.baseUrl}/boxscoretraditionalv3`);
    url.searchParams.set('GameID', gameId);

    const response = await this.fetchWithRetry(url, 3);
    return (await response.json()) as BoxScoreTraditionalResponse;
  }

  async fetchBoxScoreSummary(gameId: string): Promise<BoxScoreSummaryResponse> {
    const url = new URL(`${this.baseUrl}/boxscoresummaryv3`);
    url.searchParams.set('GameID', gameId);

    const response = await this.fetchWithRetry(url, 3);
    return (await response.json()) as BoxScoreSummaryResponse;
  }

  async fetchCommonPlayerInfo(playerId: string): Promise<PlayerInfoResponse> {
    const url = new URL(`${this.baseUrl}/commonplayerinfo`);
    url.searchParams.set('PlayerID', playerId);

    const response = await this.fetchWithRetry(url, 3);
    const contentType = response.headers.get('content-type') ?? 'unknown';
    const bodyText = await response.text();
    try {
      return JSON.parse(bodyText) as PlayerInfoResponse;
    } catch (error) {
      this.logger.error(
        `NBA commonplayerinfo parse error status=${response.status} ${response.statusText} content-type=${contentType} body=${this.truncateBody(bodyText)}`,
      );
      throw error;
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
      'user-agent':
        process.env.NBA_STATS_USER_AGENT ||
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    };
  }

  private async fetchWithRetry(url: URL, retries: number) {
    let attempt = 0;
    while (true) {
      try {
        return await this.fetchWithTimeout(url);
      } catch (error) {
        attempt += 1;
        if (attempt > retries || !this.isRetryable(error)) {
          throw error;
        }
        const delayMs = this.backoffDelayMs(attempt);
        this.logger.warn(`NBA boxscore retry ${attempt}/${retries} after ${delayMs}ms for ${url.pathname}`);
        await this.sleep(delayMs);
      }
    }
  }

  private async fetchWithTimeout(url: URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      if (this.forceIpv4 && this.ipv4Configured) {
        this.logger.debug(`NBA stats request using IPv4 first for ${url.pathname}`);
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? 'unknown';
        const body = await response.text();
        this.logger.error(
          `NBA boxscore error ${response.status} ${response.statusText} content-type=${contentType} body=${this.truncateBody(body)}`,
        );
        throw new Error(`NBA boxscore request failed: ${response.status}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private backoffDelayMs(attempt: number) {
    if (attempt <= 1) {
      return 500;
    }
    if (attempt === 2) {
      return 1500;
    }
    return 3000;
  }

  private isRetryable(error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return true;
      }
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        message.includes('nba boxscore request failed: 5') ||
        message.includes('nba boxscore request failed: 429')
      );
    }
    return false;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private configureIpv4() {
    if (!this.forceIpv4) {
      return false;
    }
    setDefaultResultOrder('ipv4first');
    return true;
  }

  private truncateBody(text: string, maxLength = 4096) {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...[truncated]`;
  }
}
