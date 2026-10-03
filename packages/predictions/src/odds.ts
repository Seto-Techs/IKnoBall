/**
 * Two-way moneyline maths.
 *
 * Bookmaker prices carry a margin, so the two implied probabilities sum to more
 * than 1. Removing it keeps both sides at equal expected value, which is what
 * makes flat and weighted scoring strategy-neutral: always picking the favourite
 * and always picking the underdog end up with the same expected score.
 */

export type OddsSide = 'home' | 'away';

export interface FairOdds {
  home: number;
  away: number;
  /** Sum of implied probabilities. Always > 1; the excess is the bookmaker margin. */
  overround: number;
}

/**
 * Normalise a two-way market so the implied probabilities sum to exactly 1.
 *
 * @param home Decimal odds for the home side, as published (e.g. 1.91).
 * @param away Decimal odds for the away side, as published (e.g. 1.79).
 */
export function deVig(home: number, away: number): FairOdds {
  const overround = 1 / home + 1 / away;
  return { home: home * overround, away: away * overround, overround };
}

/** Fair decimal price for one side of a two-way market. */
export function fairDecimal(home: number, away: number, side: OddsSide): number {
  const fair = deVig(home, away);
  return side === 'home' ? fair.home : fair.away;
}
