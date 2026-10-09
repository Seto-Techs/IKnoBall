import { useMemo } from 'react';
import {
  useMyPicks,
  type PickSide,
  type PickStatus,
  type PredictionMode,
  type PredictionPickWithGame,
} from '../../lib/api';

/**
 * One-time cleanup of the pre-API store.
 *
 * Picks now live in Postgres, so anything left under the old key is stale and
 * would only mislead if the key were ever reused.
 */
if (typeof window !== 'undefined') {
  window.localStorage.removeItem('iknoball.predictions.v1');
}

/**
 * A pick as the UI needs it.
 *
 * `pick` rather than `side` keeps the existing call sites readable, and
 * `submittedAt` is the moment the price was locked.
 */
export interface SavedPrediction {
  gameId: string;
  mode: PredictionMode;
  pick: PickSide;
  /** Fair decimal price locked at submit. Null for flat picks and for a weighted pick awaiting its price. */
  lockedDecimal: number | null;
  lockedBook: string | null;
  /** Null until the game settles. */
  points: number | null;
  status: PickStatus;
  submittedAt: string;
  /** Weighted pick waiting for the opening line. */
  pendingPrice: boolean;
}

/** Both modes for a single game; either may be absent. */
export interface GamePicks {
  flat?: SavedPrediction;
  weighted?: SavedPrediction;
}

export type PicksByGame = Record<string, GamePicks>;

/** True when the user holds at least one mode on this game. */
export function hasPick(picks: GamePicks | undefined): boolean {
  return Boolean(picks?.flat || picks?.weighted);
}

/** Every mode the user holds on this game, flat first. */
export function picksOf(picks: GamePicks | undefined): SavedPrediction[] {
  if (!picks) return [];
  return [picks.flat, picks.weighted].filter((p): p is SavedPrediction => Boolean(p));
}

/**
 * One entry per game, keeping the first mode seen.
 *
 * A single submit writes a flat row and a weighted row on the same side (see
 * `docs/prediction-scoring.md`), so one pick is two rows. Anything that counts
 * picks rather than one board's rows has to collapse them first, or every pick
 * counts twice.
 */
export function picksPerGame<T extends { gameId: string }>(picks: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const pick of picks) {
    if (seen.has(pick.gameId)) continue;
    seen.add(pick.gameId);
    unique.push(pick);
  }
  return unique;
}

/**
 * A settled points value with the right unit: `1 pt`, `0 pts`, `20 pts`.
 *
 * Classic picks settle to exactly 1, so the singular form is reachable.
 */
export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}

function toSavedPick(pick: PredictionPickWithGame): SavedPrediction {
  return {
    gameId: pick.gameId,
    mode: pick.mode,
    pick: pick.side,
    lockedDecimal: pick.lockedDecimal,
    lockedBook: pick.lockedBook,
    points: pick.points,
    status: pick.status,
    submittedAt: pick.lockedAt ?? pick.settledAt ?? new Date().toISOString(),
    pendingPrice: pick.pendingPrice,
  };
}

export function toPicksByGame(picks: PredictionPickWithGame[] | undefined): PicksByGame {
  const byGame: PicksByGame = {};
  for (const pick of picks ?? []) {
    const entry = byGame[pick.gameId] ?? {};
    entry[pick.mode] = toSavedPick(pick);
    byGame[pick.gameId] = entry;
  }
  return byGame;
}

/**
 * The signed-in user's picks, indexed by game then mode.
 *
 * Server-backed: picks live in Postgres so the locked price is authoritative and
 * survives a cleared browser. Both modes may exist on one game.
 */
export function usePredictions(): PicksByGame {
  const { data } = useMyPicks();
  return useMemo(() => toPicksByGame(data), [data]);
}
