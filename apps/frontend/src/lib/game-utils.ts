import { format } from 'date-fns';
import type { Game, TeamWithLeaders } from './api';

/**
 * Shared helpers for game-facing pages (Predictions, Game Detail, Profile).
 * Mirrors the resolution logic used by the dashboard carousels so that
 * tricodes (e.g. BKN) map to the teams list consistently across pages.
 */

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

export function canonicalAbbr(tricode: string | null | undefined): string {
  if (!tricode) return '';
  return ABBR_MAP[tricode] ?? tricode;
}

export type GameStatus = 'final' | 'live' | 'scheduled';

export function getGameStatus(g: Game): GameStatus {
  const s = (g.status ?? '').toLowerCase();
  if (s.includes('final')) return 'final';
  if (
    s.includes('live') ||
    s.includes('in progress') ||
    s.includes('halftime') ||
    s.includes('q1') ||
    s.includes('q2') ||
    s.includes('q3') ||
    s.includes('q4') ||
    s.includes('ot')
  ) {
    return 'live';
  }
  if (/q[1-4]|ot|half/i.test(s)) return 'live';
  return 'scheduled';
}

export function buildTeamLookup(teams: TeamWithLeaders[] | null | undefined): {
  byAbbr: Map<string, TeamWithLeaders>;
  byKey: Map<string, TeamWithLeaders>;
} {
  const byAbbr = new Map<string, TeamWithLeaders>();
  const byKey = new Map<string, TeamWithLeaders>();
  for (const t of teams ?? []) {
    byAbbr.set(t.abbreviation, t);
    byKey.set(canonicalAbbr(t.abbreviation), t);
    byKey.set(t.fullName, t);
    byKey.set(t.teamName, t);
    byKey.set(t.city, t);
  }
  return { byAbbr, byKey };
}

export function resolveGameTeams(
  g: Game,
  lookup: ReturnType<typeof buildTeamLookup>,
): { away: TeamWithLeaders | null; home: TeamWithLeaders | null } {
  const awayKey = canonicalAbbr(g.awayTricode) || g.awayTeam;
  const homeKey = canonicalAbbr(g.homeTricode) || g.homeTeam;
  return {
    away: lookup.byKey.get(awayKey) ?? null,
    home: lookup.byKey.get(homeKey) ?? null,
  };
}

export interface SeasonBadge {
  label: string;
  detail?: string;
  variant: 'preseason' | 'playoffs' | 'allstar' | 'regular';
}

export function getSeasonBadge(g: Game): SeasonBadge {
  const label = (g.gameLabel ?? '').trim();
  const series = (g.seriesText ?? '').trim();
  const sub = (g.gameSubLabel ?? '').trim();
  if (label === 'Preseason') return { label: 'Preseason', variant: 'preseason' };
  if (label === 'All-Star' || label === 'All-Star Championship')
    return { label: 'All-Star', variant: 'allstar' };
  if (series) return { label: 'Playoffs', detail: series || sub, variant: 'playoffs' };
  if (label.toLowerCase().includes('playoff'))
    return { label, detail: series || sub, variant: 'playoffs' };
  if (label) return { label, variant: 'regular' };
  return { label: 'Regular Season', variant: 'regular' };
}

export function formatTimeET(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch {
    return '';
  }
}

export function formatGameDate(value: string, pattern: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, pattern);
}

/**
 * Formats a date-only string (YYYY-MM-DD). `new Date('2026-01-21')` parses as UTC
 * midnight, which renders as the previous day in negative-offset timezones, so
 * build the date from its parts instead.
 */
export function formatDateOnly(value: string, pattern: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return formatGameDate(value, pattern);
  return format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), pattern);
}

/** Relative luminance of a hex color (#RRGGBB) — used to pick readable text. */
export function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function sortGamesChronologically(games: Game[]): Game[] {
  return [...games].sort(
    (a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime(),
  );
}
