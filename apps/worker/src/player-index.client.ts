import { Injectable, Logger } from '@nestjs/common';

type PlayerIndexResponse = {
  resultSets: Array<{
    name: string;
    headers: string[];
    rowSet: unknown[][];
  }>;
};

type PlayerDashboardResponse = {
  resultSets: Array<{
    name: string;
    headers: string[];
    rowSet: unknown[][];
  }>;
};

@Injectable()
export class PlayerIndexClient {
  private readonly logger = new Logger(PlayerIndexClient.name);
  private readonly baseUrl = process.env.NBA_STATS_BASE_URL || 'https://stats.nba.com/stats';
  private readonly requestTimeoutMs = 15000;

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

  async fetchPlayerIndex(season: string): Promise<PlayerIndexResponse> {
    const url = new URL(`${this.baseUrl}/playerindex`);
    url.searchParams.set('LeagueID', '00');
    url.searchParams.set('Season', season);

    const response = await this.fetchWithTimeout(url);
    return (await response.json()) as PlayerIndexResponse;
  }

  async fetchPlayerDashboardByYear(
    playerId: string,
    season: string,
    seasonType: string,
  ): Promise<PlayerDashboardResponse> {
    const url = new URL(`${this.baseUrl}/playerdashboardbyyearoveryear`);
    url.searchParams.set('PlayerID', playerId);
    url.searchParams.set('LastNGames', '0');
    url.searchParams.set('MeasureType', 'Base');
    url.searchParams.set('Month', '0');
    url.searchParams.set('OpponentTeamID', '0');
    url.searchParams.set('PaceAdjust', 'N');
    url.searchParams.set('PerMode', 'Totals');
    url.searchParams.set('Period', '0');
    url.searchParams.set('PlusMinus', 'N');
    url.searchParams.set('Rank', 'N');
    url.searchParams.set('Season', season);
    url.searchParams.set('SeasonType', seasonType);
    url.searchParams.set('DateFrom', '');
    url.searchParams.set('DateTo', '');
    url.searchParams.set('GameSegment', '');
    url.searchParams.set('LeagueID', '00');
    url.searchParams.set('Location', '');
    url.searchParams.set('Outcome', '');
    url.searchParams.set('PORound', '0');
    url.searchParams.set('SeasonSegment', '');
    url.searchParams.set('ShotClockRange', '');
    url.searchParams.set('VsConference', '');
    url.searchParams.set('VsDivision', '');

    const response = await this.fetchWithRetry(url, 3);
    return (await response.json()) as PlayerDashboardResponse;
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
          `NBA stats retry ${attempt}/${retries} after ${delayMs}ms for ${url.pathname}`,
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
        this.logger.error(`NBA stats error ${response.status}: ${body}`);
        throw new Error(`NBA stats request failed: ${response.status}`);
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
      return message.includes('timeout') || message.includes('etimedout') || message.includes('econnreset');
    }
    return false;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
