import { Injectable, Logger } from '@nestjs/common';

/**
 * One action in the live play-by-play feed. Only the fields this worker reads
 * are typed; the feed carries around fifty, most of them irrelevant here.
 */
export interface CdnPlayByPlayAction {
  actionNumber: number;
  actionType: string;
  subType: string;
  period: number;
  teamTricode: string;
  personId: number;
  /** 1 on a field-goal attempt, absent otherwise. */
  isFieldGoal?: number;
  /** Shot location in tenths of a foot, rim centre at the origin. */
  xLegacy?: number;
  yLegacy?: number;
  shotDistance?: number;
  shotResult?: string;
  area?: string;
  areaDetail?: string;
}

export interface CdnPlayByPlayResponse {
  meta: { version: number; code: number; request: string; time: string };
  game: {
    gameId: string;
    gameStatus: number;
    actions: CdnPlayByPlayAction[];
  };
}

/**
 * The CDN's live play-by-play feed, which carries a recorded location for every
 * field-goal attempt. This is the same host the box-score crawler already reads,
 * and the coordinates are the pair `stats.nba.com/stats/shotchartdetail` reports
 * as `LOC_X`/`LOC_Y`, so the zone taxonomy applies to either source unchanged.
 *
 * A separate client from the box-score one only because it reads a different
 * path on the same host; the headers are the same browser impersonation, and are
 * duplicated here like every other NBA client in this worker.
 *
 * Node only: cdn.nba.com answers Bun's fetch with a 403 regardless of headers.
 * Anything calling this must run under Node, which is why the shot-zone refresh
 * is a `node dist/...` script rather than an in-process BullMQ worker.
 */
@Injectable()
export class NbaCdnPlayByPlayClient {
  private readonly logger = new Logger(NbaCdnPlayByPlayClient.name);
  private readonly baseUrl = 'https://cdn.nba.com/static/json/liveData/playbyplay';
  private readonly requestTimeoutMs = 15000;

  async fetchPlayByPlay(gameId: string): Promise<CdnPlayByPlayResponse> {
    const url = new URL(`${this.baseUrl}/playbyplay_${gameId}.json`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.error(`CDN play-by-play error ${response.status} for game ${gameId}`);
        throw new Error(`CDN play-by-play request failed: ${response.status}`);
      }

      return (await response.json()) as CdnPlayByPlayResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): Record<string, string> {
    return {
      Host: 'cdn.nba.com',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      Referer: 'https://www.nba.com/',
      Origin: 'https://www.nba.com',
      'Sec-GPC': '1',
      Connection: 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      Priority: 'u=4',
      TE: 'trailers',
    };
  }
}
