import type { Standings, Team } from './api';

/**
 * The schedule's team codes against the `teams` table's.
 *
 * The NBA's own feed says `BKN` for Brooklyn while `teams` carries `BRK`, and
 * every page on the site goes through this one alias. Without it a Nets game has
 * no logo, no colour and no record, which reads as a broken row rather than as a
 * missing translation.
 */
const ABBR_ALIAS: Record<string, string> = { BKN: 'BRK' };

export function canonicalAbbr(tricode: string | null | undefined): string {
  if (!tricode) return '';
  const upper = tricode.trim().toUpperCase();
  return ABBR_ALIAS[upper] ?? upper;
}

/** A team as a row needs it: the mark, the name, the record, and the colour. */
export interface Club {
  abbreviation: string;
  /** `Cavaliers`, not `Cleveland Cavaliers` — rows are narrow. */
  name: string;
  fullName: string;
  logoUrl: string | null;
  color: string | null;
  /** `12-8`, or null before the season's standings exist. */
  record: string | null;
}

export interface ClubIndex {
  teams: Map<string, Team>;
  records: Map<string, { wins: number; losses: number }>;
}

export function buildClubIndex(teams?: Team[], standings?: Standings): ClubIndex {
  const byAbbr = new Map<string, Team>();
  for (const team of teams ?? []) byAbbr.set(canonicalAbbr(team.abbreviation), team);

  const records = new Map<string, { wins: number; losses: number }>();
  for (const row of [...(standings?.West ?? []), ...(standings?.East ?? [])]) {
    records.set(canonicalAbbr(row.teamAbbr), { wins: row.wins, losses: row.losses });
  }

  return { teams: byAbbr, records };
}

/**
 * One side of a game, resolved from the schedule plus whatever `teams` knows.
 *
 * The schedule always names both sides, so a game against a club with no row in
 * `teams` still renders: it keeps the schedule's name and code and simply has no
 * mark. That is a real state (exhibition sides, All-Star squads), not an error.
 */
export function resolveClub(
  index: ClubIndex,
  tricode: string | null | undefined,
  fullName: string,
): Club {
  const abbr = canonicalAbbr(tricode);
  const team =
    (abbr ? index.teams.get(abbr) : undefined) ??
    [...index.teams.values()].find((entry) => entry.fullName === fullName);

  const record = index.records.get(canonicalAbbr(team?.abbreviation ?? abbr));

  const code = team?.abbreviation ?? abbr;
  return {
    abbreviation: code || fullName.slice(0, 3).toUpperCase(),
    name: team?.teamName ?? fullName,
    fullName: team?.fullName ?? fullName,
    logoUrl: team?.logoUrl ?? null,
    color: team?.primaryColor ?? null,
    record: record ? `${record.wins}-${record.losses}` : null,
  };
}
