/**
 * What a card is built from.
 *
 * The card is rendered from two plain records rather than from Drizzle rows or
 * from a client: `cardPayload` has to be callable from a unit test with no
 * database, no gateway, and no token, so these are the only shapes it knows.
 *
 * The game fields mirror the backend's `GameResponse`
 * (`apps/backend/src/games.controller.ts`) so the scheduler can pass one through
 * untouched; the team fields mirror the `teams` row plus the record the web card
 * already shows.
 */

/** Recent form, most recent first. The card shows the first five. */
export type TeamFormResult = 'W' | 'L';

export interface CardTeamRecord {
  wins: number;
  losses: number;
  /**
   * Optional: a team with no completed games this season has no form, and the
   * card says so rather than rendering an empty field.
   */
  form?: readonly TeamFormResult[];
}

export interface CardTeam {
  /** The tricode the schedule reports (BKN, GSW), which is also the emoji name. */
  tricode: string;
  /** 'Memphis Grizzlies' — used when there is no tricode to show. */
  name: string;
  /** SVG on cdn.nba.com. Kept for reference; Discord will not render it. */
  logoUrl?: string | null;
  record?: CardTeamRecord | null;
}

/** One record per side, so nothing has to be looked up by tricode. */
export interface CardTeams {
  away: CardTeam;
  home: CardTeam;
}

export interface CardGame {
  /** NBA game id, e.g. `0022601194`. Goes into the custom_id and the footer. */
  id: string;
  awayTeam: string;
  homeTeam: string;
  /** Null for an opponent that has no `teams` row (preseason, All-Star). */
  awayTricode: string | null;
  homeTricode: string | null;
  /** ISO-8601 UTC. Rendered as `<t:UNIX:f>` so each reader sees their own clock. */
  gameDateTime: string;
  /** Playoff series context, e.g. 'DAL leads 2-1'. Empty outside the playoffs. */
  seriesText?: string | null;
}
