/**
 * Scoring rules for game-winner picks.
 *
 * Both modes run through one formula so they cannot drift apart:
 *
 *   flat      correct -> 1 point
 *   weighted  correct -> round(K * d), capped
 *             wrong   -> 0
 *
 * where `d` is the fair decimal price locked when the pick was submitted.
 * Settlement reads only the locked price, never live odds.
 */

export type PredictionMode = 'flat' | 'weighted';

/** Multiplier from decimal odds to points. A coin-flip (~2.0) pays ~20. */
export const POINTS_SCALE = 10;

/**
 * Validation ceiling, not a strategy cap.
 *
 * Fair odds already make every strategy equal-EV, so no cap is needed for
 * balance. This only stops a corrupt feed row (a stray +30000) from minting
 * thousands of points. It sits far above the longest underdog that has ever won
 * outright (+1100), so it never clips a real result.
 */
export const POINTS_CEILING = 150;

/**
 * Points a pick is worth.
 *
 * @param mode         Which scoring mode the pick was placed in.
 * @param fairDecimal  De-vigged decimal price locked at submit. Null for flat picks.
 * @param correct      Whether the pick named the winner.
 */
export function pointsFor(
  mode: PredictionMode,
  fairDecimal: number | null,
  correct: boolean,
): number {
  if (!correct) return 0;
  if (mode === 'flat') return 1;
  if (fairDecimal === null) return 0;
  return Math.min(Math.round(POINTS_SCALE * fairDecimal), POINTS_CEILING);
}

/** Points a pick would pay if it turns out correct — used for the pick preview. */
export function potentialPoints(mode: PredictionMode, fairDecimal: number | null): number {
  return pointsFor(mode, fairDecimal, true);
}
