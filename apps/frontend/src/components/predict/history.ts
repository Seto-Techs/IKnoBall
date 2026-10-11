import type { PickSide, PickStatus, PredictionMode, PredictionPickWithGame } from '../../lib/api';
import { etDateKey } from '../../lib/game-utils';
import { seasonLabel, weekStartOf } from './week';

/**
 * One mode on one game, carrying just enough game context to render a history
 * row. This is the shape every history view works off, so the table, the filters
 * and the counts can never disagree about what a pick is.
 */
export interface PickHistoryRow {
  gameId: string;
  gameDateTime: string | null;
  /** 1 scheduled, 2 live, 3 final. Null when the schedule row is gone. */
  gameStatus: number | null;
  awayTricode: string | null;
  homeTricode: string | null;
  awayTeam: string | null;
  homeTeam: string | null;
  awayScore: number | null;
  homeScore: number | null;
  side: PickSide;
  mode: PredictionMode;
  status: PickStatus;
  points: number | null;
  lockedDecimal: number | null;
}

/** How a pick reads once the game is over, or why it has no verdict yet. */
export type PickVerdict = 'correct' | 'missed' | 'open' | 'pending' | 'void';

export function verdictOf(row: PickHistoryRow): PickVerdict {
  if (row.status === 'voided') return 'void';
  if (row.status === 'settled') return (row.points ?? 0) > 0 ? 'correct' : 'missed';
  return row.gameStatus === 1 ? 'open' : 'pending';
}

/** One season the user has picks in. */
export interface PickSeason {
  season: string;
  /** Distinct games picked — a pick writes a flat and a weighted row. */
  games: number;
  /** Of `games`, the ones whose pick has settled. */
  settled: number;
  /** Of `settled`, how many landed. */
  correct: number;
}

/** The week a row belongs to, or null when the row has no date to place it. */
function rowWeekKey(row: PickHistoryRow): string | null {
  if (!row.gameDateTime) return null;
  return weekStartOf(etDateKey(new Date(row.gameDateTime)));
}

/** The season a row belongs to, or null when it has no date. */
export function rowSeason(row: PickHistoryRow): string | null {
  const week = rowWeekKey(row);
  return week ? seasonLabel(week) : null;
}

/**
 * Every season the rows touch, newest first.
 *
 * A pick writes a flat and a weighted row for the same game, so games, settled
 * and correct are collected in sets keyed by game — counting rows would score
 * every pick twice.
 */
export function buildPickSeasons(rows: PickHistoryRow[]): PickSeason[] {
  const seasons = new Map<
    string,
    { games: Set<string>; settled: Set<string>; correct: Set<string> }
  >();

  for (const row of rows) {
    const season = rowSeason(row);
    if (!season) continue;
    let entry = seasons.get(season);
    if (!entry) {
      entry = { games: new Set(), settled: new Set(), correct: new Set() };
      seasons.set(season, entry);
    }
    entry.games.add(row.gameId);
    if (row.status === 'settled') {
      entry.settled.add(row.gameId);
      if ((row.points ?? 0) > 0) entry.correct.add(row.gameId);
    }
  }

  return [...seasons.entries()]
    .map(([season, entry]) => ({
      season,
      games: entry.games.size,
      settled: entry.settled.size,
      correct: entry.correct.size,
    }))
    .sort((a, b) => (a.season < b.season ? 1 : -1));
}

/** The signed-in user's picks, flattened to history rows. */
export function rowsFromPicks(picks: PredictionPickWithGame[] | undefined): PickHistoryRow[] {
  return (picks ?? []).map((pick) => ({
    gameId: pick.gameId,
    gameDateTime: pick.gameDateTime,
    gameStatus: pick.gameStatus,
    awayTricode: pick.awayTricode,
    homeTricode: pick.homeTricode,
    awayTeam: pick.awayTeam,
    homeTeam: pick.homeTeam,
    awayScore: pick.awayScore,
    homeScore: pick.homeScore,
    side: pick.side,
    mode: pick.mode,
    status: pick.status,
    points: pick.points,
    lockedDecimal: pick.lockedDecimal,
  }));
}
