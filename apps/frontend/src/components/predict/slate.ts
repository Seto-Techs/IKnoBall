import type { Game } from '../../lib/api';
import { etDateKey, gameDateKey, getGameStatus, shiftEtDate } from '../../lib/game-utils';
import { hasPick, picksOf, type PicksByGame } from './predictions';

/** Calendar days the slate covers: today plus the next six. */
export const SLATE_DAY_COUNT = 7;

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
  picked: number;
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

export function buildSlateDays(
  games: Game[] | undefined,
  predictions: PicksByGame,
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
  const days: SlateDay[] = [];
  for (let offset = 0; offset < SLATE_DAY_COUNT; offset++) {
    const key = shiftEtDate(offset, now);
    const anchor = new Date(`${key}T12:00:00.000Z`);
    const dayGames = (gamesByDate.get(key) ?? [])
      .slice()
      .sort((a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime());

    days.push({
      key,
      anchor,
      label: labelFormatter.format(anchor),
      weekday: weekdayFormatter.format(anchor),
      month: monthFormatter.format(anchor),
      dayOfMonth: String(anchor.getUTCDate()),
      isToday: key === todayKey,
      games: dayGames,
      picked: dayGames.filter((g) => hasPick(predictions[g.id])).length,
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

export function slateStats(days: SlateDay[], predictions: PicksByGame): SlateStats {
  let total = 0;
  let open = 0;
  let pickedOpen = 0;
  let picked = 0;
  let resolved = 0;
  let correct = 0;

  for (const day of days) {
    for (const game of day.games) {
      total++;
      const isOpen = getGameStatus(game) === 'scheduled';
      if (isOpen) open++;
      const gamePicks = predictions[game.id];
      if (!hasPick(gamePicks)) continue;
      picked++;
      if (isOpen) pickedOpen++;
      if (getGameStatus(game) !== 'final') continue;

      // Each mode is its own entry, so a game can contribute more than one
      // resolved pick.
      const winner = winnerOf(game);
      if (!winner) continue;
      for (const pick of picksOf(gamePicks)) {
        resolved++;
        if (pick.pick === winner) correct++;
      }
    }
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
