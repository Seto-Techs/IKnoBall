import { Injectable, Logger } from '@nestjs/common';

export type NbaScheduleResponse = {
  meta: {
    version: number;
    request: string;
    time: string;
  };
  leagueSchedule: {
    seasonYear: string;
    leagueId: string;
    gameDates: Array<{
      gameDate: string;
      games: Array<{
        gameId: string;
        gameCode: string;
        gameStatus: number;
        gameStatusText: string;
        gameSequence: number;
        gameDateEst: string | null;
        gameTimeEst: string | null;
        gameDateTimeEst: string | null;
        gameDateUTC: string | null;
        gameTimeUTC: string | null;
        gameDateTimeUTC: string | null;
        awayTeamTime: string | null;
        homeTeamTime: string | null;
        day: string | null;
        monthNum: number | null;
        weekNumber: number | null;
        weekName: string | null;
        ifNecessary: string | null;
        seriesGameNumber: string | null;
        gameLabel: string | null;
        gameSubLabel: string | null;
        seriesText: string | null;
        arenaName: string | null;
        arenaState: string | null;
        arenaCity: string | null;
        postponedStatus: string | null;
        branchLink: string | null;
        gameSubtype: string | null;
        isNeutral: boolean;
        homeTeam: {
          teamId: number | null;
          teamName: string | null;
          teamCity: string | null;
          teamTricode: string | null;
          teamSlug: string | null;
          wins: number | null;
          losses: number | null;
          score: number | null;
          seed: number | null;
        };
        awayTeam: {
          teamId: number | null;
          teamName: string | null;
          teamCity: string | null;
          teamTricode: string | null;
          teamSlug: string | null;
          wins: number | null;
          losses: number | null;
          score: number | null;
          seed: number | null;
        };
        pointsLeaders: Array<{
          personId: number | null;
          firstName: string | null;
          lastName: string | null;
          teamId: number | null;
          teamCity: string | null;
          teamName: string | null;
          teamTricode: string | null;
          points: number | null;
        }>;
      }>;
    }>;
  };
};

@Injectable()
export class NbaScheduleClient {
  private readonly logger = new Logger(NbaScheduleClient.name);
  private readonly baseUrl = process.env.NBA_STATS_BASE_URL || 'https://stats.nba.com/stats';
  private readonly requestTimeoutMs = 15000;

  async fetchLeagueSchedule(season: string, leagueId: string): Promise<NbaScheduleResponse> {
    const url = new URL(`${this.baseUrl}/scheduleleaguev2`);
    url.searchParams.set('Season', season);
    url.searchParams.set('LeagueID', leagueId);

    const response = await this.fetchWithRetry(url, 3);
    return (await response.json()) as NbaScheduleResponse;
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
        this.logger.warn(
          `NBA schedule retry ${attempt}/${retries} after ${delayMs}ms for ${url.pathname}`,
        );
        await this.sleep(delayMs);
      }
    }
  }

  private async fetchWithTimeout(url: URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`NBA schedule error ${response.status}: ${body}`);
        throw new Error(`NBA schedule request failed: ${response.status}`);
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
        message.includes('nba schedule request failed: 5') ||
        message.includes('nba schedule request failed: 429')
      );
    }
    return false;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
