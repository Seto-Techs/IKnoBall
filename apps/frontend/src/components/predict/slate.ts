import type { Game } from '../../lib/api';
import { etDateKey, gameDateKey, getGameStatus } from '../../lib/game-utils';
import { hasPick, picksOf, type PicksByGame } from './predictions';
import { weekStartKey, weekStartOf } from './week';

/** Calendar days the slate covers: today plus the next six. */
export const SLATE_DAY_COUNT = 7;

/** Ways a slate day's games can be narrowed down. */
export const PICK_FILTERS = ['all', 'unpicked', 'picked'] as const;

export type PickFilter = (typeof PICK_FILTERS)[number];

/**
 * The slate view, as carried in the URL.
 *
 * Keeping it in search params is what lets a reader walk into a game and come
 * back to the day they were predicting — the route remounts on the way back, so
 * local state would reset to today.
 */
export interface SlateSearch {
  /** Sunday that opens the week. Only needed when no day is selected. */
  week?: string;
  /** The selected `YYYY-MM-DD` day; the week is derived from it. */
  day?: string;
  /** Omitted means `all`. */
  filter?: PickFilter;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value);
}

/** Drop anything malformed so a hand-edited URL falls back to the defaults. */
export function parseSlateSearch(search: Record<string, unknown>): SlateSearch {
  return {
    week: isDateKey(search.week) ? search.week : undefined,
    day: isDateKey(search.day) ? search.day : undefined,
    filter: PICK_FILTERS.find((key) => key === search.filter),
  };
}

/** The Sunday the slate opens on: the selected day's week, else the given week. */
export function slateWeekStart(search: SlateSearch, now: Date = new Date()): string {
  if (search.day) return weekStartOf(search.day);
  return search.week ?? weekStartKey(0, now);
}

export interface SlateDay {
  key: string;
  /** Anchored at 12:00 UTC so the formatted weekday never rolls over. */
  anchor: Date;
  label: string;
  weekday: string;
  month: string;
  dayOfMonth: string;
  isToday: boolean;
  games: Game[];
  /** Games with at least one mode held. */
  picked: number;
  /** Of `picked`, the ones still open for a pick. */
  pickedOpen: number;
  /** Of `picked`, the ones final with a decided winner. */
  settled: number;
  /** Of `settled`, how many landed. */
  correct: number;
  open: number;
}

export interface SlateStats {
  total: number;
  open: number;
  picked: number;
  remaining: number;
  resolved: number;
  correct: number;
}

const labelFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function formatSlateDayLabel(key: string): string {
  const anchor = new Date(`${key}T12:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return key;
  return labelFormatter.format(anchor);
}

/**
 * `SLATE_DAY_COUNT` days starting at `startKey`, in order.
 *
 * The start is explicit so a week view can anchor on a Sunday instead of today.
 */
export function buildDaysFrom(
  games: Game[] | undefined,
  predictions: PicksByGame,
  startKey: string,
  now: Date = new Date(),
): SlateDay[] {
  const gamesByDate = new Map<string, Game[]>();
  for (const game of games ?? []) {
    const key = gameDateKey(game);
    if (!key) continue;
    const bucket = gamesByDate.get(key);
    if (bucket) bucket.push(game);
    else gamesByDate.set(key, [game]);
  }

  const todayKey = etDateKey(now);
  const start = new Date(`${startKey}T12:00:00.000Z`);
  const days: SlateDay[] = [];
  for (let offset = 0; offset < SLATE_DAY_COUNT; offset++) {
    const anchor = new Date(start);
    anchor.setUTCDate(anchor.getUTCDate() + offset);
    const key = anchor.toISOString().slice(0, 10);
    const dayGames = (gamesByDate.get(key) ?? [])
      .slice()
      .sort((a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime());

    let picked = 0;
    let pickedOpen = 0;
    let settled = 0;
    let correct = 0;
    for (const game of dayGames) {
      const gamePicks = predictions[game.id];
      if (!hasPick(gamePicks)) continue;
      picked++;
      if (getGameStatus(game) === 'scheduled') pickedOpen++;
      if (getGameStatus(game) !== 'final') continue;
      // One pick covers both modes, so a final game resolves once — not once
      // per row.
      const winner = winnerOf(game);
      const [pick] = picksOf(gamePicks);
      if (!winner || !pick) continue;
      settled++;
      if (pick.pick === winner) correct++;
    }

    days.push({
      key,
      anchor,
      label: labelFormatter.format(anchor),
      weekday: weekdayFormatter.format(anchor),
      month: monthFormatter.format(anchor),
      dayOfMonth: String(anchor.getUTCDate()),
      isToday: key === todayKey,
      games: dayGames,
      picked,
      pickedOpen,
      settled,
      correct,
      open: dayGames.filter((g) => getGameStatus(g) === 'scheduled').length,
    });
  }
  return days;
}

function winnerOf(game: Game): 'away' | 'home' | null {
  if (game.awayScore == null || game.homeScore == null) return null;
  if (game.awayScore === game.homeScore) return null;
  return game.awayScore > game.homeScore ? 'away' : 'home';
}

/**
 * Roll the per-day tallies up into the strip above the slate.
 *
 * A pure sum over `days`: `buildDaysFrom` already resolved each day against the
 * picks, so nothing is recomputed here.
 */
export function slateStats(days: SlateDay[]): SlateStats {
  let total = 0;
  let open = 0;
  let picked = 0;
  let pickedOpen = 0;
  let resolved = 0;
  let correct = 0;

  for (const day of days) {
    total += day.games.length;
    open += day.open;
    picked += day.picked;
    pickedOpen += day.pickedOpen;
    resolved += day.settled;
    correct += day.correct;
  }

  return { total, open, picked, remaining: open - pickedOpen, resolved, correct };
}

/** The day the slate should open on: today when it has games, else the next day that does. */
export function defaultSlateDayKey(days: SlateDay[], now: Date = new Date()): string {
  const todayKey = etDateKey(now);
  const today = days.find((d) => d.key === todayKey);
  if (today && today.games.length > 0) return today.key;
  return days.find((d) => d.games.length > 0)?.key ?? todayKey;
}
