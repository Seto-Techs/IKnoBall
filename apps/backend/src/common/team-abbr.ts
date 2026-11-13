/**
 * The feed's tricode to the `teams` table's abbreviation.
 *
 * The two disagree for one club: the stats and schedule feeds say BKN, the
 * seeded teams table says BRK. Anything joining a feed code to a teams row goes
 * through here — the `teams` table is the source of truth for identity, so its
 * spelling wins.
 */
const TEAM_ABBREVIATION: Readonly<Record<string, string>> = { BKN: 'BRK' };

export function canonicalTeamAbbr(abbr: string | null | undefined): string {
  const upper = abbr?.trim().toUpperCase() ?? '';
  return TEAM_ABBREVIATION[upper] ?? upper;
}
