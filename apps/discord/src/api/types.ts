import type { OddsSide, PredictionMode } from '@iknoball/predictions';

/**
 * Every backend route returns this envelope (`apps/backend/src/common/http/response.ts`).
 * The client unwraps `data` and surfaces `message` through `ApiError`.
 */
export interface ApiResponse<T> {
  is_success: boolean;
  message: string;
  data: T | null;
}

export interface HealthResult {
  status: string;
}

export interface PlacePickInput {
  /** IKnoBall user id, resolved from the Discord account by the link chunk. */
  userId: string;
  gameId: string;
  side: OddsSide;
}

/**
 * One row of `prediction_picks` over the wire — `PredictionsService.PickRow` with
 * its dates serialised. `placePick` returns both modes, so callers get an array.
 */
export interface PickResult {
  gameId: string;
  mode: PredictionMode;
  side: OddsSide;
  lockedDecimal: number | null;
  lockedBook: string | null;
  lockedAt: string | null;
  points: number | null;
  status: string;
  settledAt: string | null;
}

/** `PredictionsService.PickWithGame`: a pick plus the game it was made on. */
export interface PickWithGameResult extends PickResult {
  homeTeam: string | null;
  awayTeam: string | null;
  homeTricode: string | null;
  awayTricode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTime: string | null;
  gameStatus: number | null;
  /** True when the pick is waiting on an opening line before it can be scored. */
  pendingPrice: boolean;
}

export interface ListPicksQuery {
  userId: string;
  mode?: PredictionMode;
}

/** `PredictionsService.LeaderboardRow`, ranked within one mode. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  picks: number;
  correct: number;
}

export interface LeaderboardQuery {
  guildId: string;
  mode: PredictionMode;
  /**
   * The caller's Discord user id, so the board can append their own row when the
   * top ten does not contain it. `/leaderboard` always sends it.
   */
  viewerDiscordUserId?: string;
}

export interface ResolveLinkQuery {
  discordUserId: string;
}

export interface ResolveLinkResult {
  /** Null when the Discord account has no IKnoBall user yet. */
  userId: string | null;
}
