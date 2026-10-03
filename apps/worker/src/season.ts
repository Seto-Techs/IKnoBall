import { Logger } from '@nestjs/common';

/**
 * NBA seasons are labelled by the two calendar years they span ("2026-27") and
 * run October → June. Rosters start moving as soon as free agency opens in
 * July, so from July onward the upcoming season is the one whose player index
 * reflects current teams; before July we are still inside the season that began
 * last October.
 */
const ROLLOVER_MONTH = 7;

const logger = new Logger('Season');

/** Season label (e.g. "2026-27") that the given date belongs to. */
export function seasonForDate(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const firstYear = month >= ROLLOVER_MONTH ? year : year - 1;
  return `${firstYear}-${String((firstYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Season the worker should sync.
 *
 * The season is a pure function of the calendar, so the clock wins over
 * `NBA_CURRENT_SEASON`. Trusting a hand-maintained env var is what left Giannis
 * on MIL after he moved to MIA: the value stayed on the previous season at the
 * rollover, so every sync rewrote the old rosters. A disagreeing env is logged
 * so a forgotten bump is visible instead of silently corrupting team data.
 */
export function resolveCurrentSeason(date: Date = new Date()): string {
  const derived = seasonForDate(date);
  const configured = process.env.NBA_CURRENT_SEASON?.trim();
  if (configured && configured !== derived) {
    logger.warn(
      `NBA_CURRENT_SEASON=${configured} is stale (calendar says ${derived}); syncing ${derived}`,
    );
  }
  return derived;
}
