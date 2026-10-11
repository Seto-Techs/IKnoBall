import { etDateKey, shiftEtDate } from '../../lib/game-utils';

/** Days in a slate week: Sunday through Saturday, US/Eastern. */
export const WEEK_DAY_COUNT = 7;

const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dayFormatterOnly = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  timeZone: 'UTC',
});

/** ET day of week for a `YYYY-MM-DD` key. 0 = Sunday. */
function dayOfWeek(key: string): number {
  return new Date(`${key}T12:00:00.000Z`).getUTCDay();
}

/**
 * The Sunday that opens the ET week `weekOffset` weeks away from the current
 * one: 0 is this week, -1 last week, 1 next week.
 *
 * Anchored on the ET calendar so a Saturday-night tip-off stays in its own week.
 */
export function weekStartKey(weekOffset: number, now: Date = new Date()): string {
  return shiftEtDate(weekOffset * WEEK_DAY_COUNT - dayOfWeek(etDateKey(now)), now);
}

/** `Oct 4 – 10, 2026`, repeating the month only when the week straddles two. */
export function formatWeekRangeLabel(startKey: string, endKey: string): string {
  const start = new Date(`${startKey}T12:00:00.000Z`);
  const end = new Date(`${endKey}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return `${startKey} – ${endKey}`;
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const tail = sameMonth ? dayFormatterOnly.format(end) : monthDayFormatter.format(end);
  return `${monthDayFormatter.format(start)} – ${tail}, ${end.getUTCFullYear()}`;
}

/** `This week`, `Last week`, `Next week`, or null further out. */
export function relativeWeekLabel(weekOffset: number): string | null {
  if (weekOffset === 0) return 'This week';
  if (weekOffset === -1) return 'Last week';
  if (weekOffset === 1) return 'Next week';
  return null;
}

/** The Sunday that opens the ET week containing `dateKey`. */
export function weekStartOf(dateKey: string): string {
  const anchor = new Date(`${dateKey}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() - dayOfWeek(dateKey));
  return anchor.toISOString().slice(0, 10);
}

/** The Saturday that closes the week opened by `startKey`. */
export function weekEndOf(startKey: string): string {
  const anchor = new Date(`${startKey}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + WEEK_DAY_COUNT - 1);
  return anchor.toISOString().slice(0, 10);
}

/** Whole weeks from the current week to `startKey`: 0 this week, -1 last week. */
export function weekOffsetOf(startKey: string, now: Date = new Date()): number {
  const current = new Date(`${weekStartKey(0, now)}T12:00:00.000Z`).getTime();
  const target = new Date(`${startKey}T12:00:00.000Z`).getTime();
  return Math.round((target - current) / (WEEK_DAY_COUNT * 24 * 60 * 60 * 1000));
}

/**
 * The season a week belongs to, as `2025-26`.
 *
 * The NBA season runs October to June, so anything from July onward opens the
 * season named after its own year, and January to June belongs to the season
 * that started the previous October.
 */
export function seasonLabel(weekStartKey: string): string {
  const date = new Date(`${weekStartKey}T12:00:00.000Z`);
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
