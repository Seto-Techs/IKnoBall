import { Injectable, Logger } from '@nestjs/common';

export interface CdnBoxScoreResponse {
  meta: { version: number; code: number; request: string; time: string };
  game: CdnGame;
}

export interface CdnGame {
  gameId: string;
  gameTimeLocal: string;
  gameTimeUTC: string;
  gameTimeHome: string;
  gameTimeAway: string;
  gameEt: string;
  duration: number;
  gameCode: string;
  gameStatusText: string;
  gameStatus: number;
  regulationPeriods: number;
  period: number;
  gameClock: string;
  attendance: number;
  sellout: string;
  arena: {
    arenaId: number;
    arenaName: string;
    arenaCity: string;
    arenaState: string;
    arenaCountry: string;
    arenaTimezone: string;
  };
  officials: Array<{
    personId: number;
    name: string;
    nameI: string;
    firstName: string;
    familyName: string;
    jerseyNum: string;
    assignment: string;
  }>;
  homeTeam: CdnTeamSide;
  awayTeam: CdnTeamSide;
}

export interface CdnTeamSide {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  inBonus: string;
  timeoutsRemaining: number;
  periods: Array<{ period: number; periodType: string; score: number }>;
  players: CdnPlayer[];
  statistics: Record<string, unknown>;
}

export interface CdnPlayer {
  status: string;
  order: number;
  personId: number;
  jerseyNum: string;
  position: string;
  starter: string;
  oncourt: string;
  played: string;
  statistics: CdnPlayerStats | null;
  name: string;
  nameI: string;
  firstName: string;
  familyName: string;
}

export interface CdnPlayerStats {
  minutes: string;
  minutesCalculated: string;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointersPercentage: number;
  twoPointersMade: number;
  twoPointersAttempted: number;
  twoPointersPercentage: number;
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
  foulsOffensive: number;
  foulsDrawn: number;
  foulsTechnical: number;
  points: number;
  plusMinusPoints: number;
  plus: number;
  minus: number;
  pointsFastBreak: number;
  pointsInThePaint: number;
  pointsSecondChance: number;
  blocksReceived: number;
}

@Injectable()
export class NbaCdnBoxScoreClient {
  private readonly logger = new Logger(NbaCdnBoxScoreClient.name);
  private readonly baseUrl = 'https://cdn.nba.com/static/json/liveData/boxscore';
  private readonly requestTimeoutMs = 15000;

  async fetchLiveBoxScore(gameId: string): Promise<CdnBoxScoreResponse> {
    const url = new URL(`${this.baseUrl}/boxscore_${gameId}.json`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`CDN boxscore request failed: ${response.status}`);
      }

      return (await response.json()) as CdnBoxScoreResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): Record<string, string> {
    return {
      Host: 'cdn.nba.com',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
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
      'TE': 'trailers',
    };
  }
}