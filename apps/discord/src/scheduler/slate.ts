/**
 * Which games are on a guild's slate today.
 *
 * Pure: no database, no gateway, no clock. The scheduler hands in rows and an
 * instant, so a test can pin the selection at any hour of any day.
 *
 * A card is one message. Discord renders every embed in a message before any of
 * its components, so two cards in one message put both cards above both button
 * rows, and the reader cannot tell which buttons pick which game. One card per
 * message puts each game's buttons directly under its card (DISC-10).
 */
import type { CardGame, CardStake, CardTeam, CardTeams } from '../cards/types';
import { slateDateKey } from './slate-date';

/** A `schedule_games` row, as far as a card is concerned. */
export interface SlateGame {
  gameId: string;
  gameStatus: number;
  gameDate: string | null;
  gameDateTimeUTC: Date | null;
  awayTeamTricode: string | null;
  awayTeamCity: string | null;
  awayTeamName: string | null;
  homeTeamTricode: string | null;
  homeTeamCity: string | null;
  homeTeamName: string | null;
  seriesText: string | null;
  /** The season the row's day belongs to, which is the season the record is for. */
  seasonYear: string | null;
}

/**
 * The ET day a schedule row belongs to.
 *
 * `slateDateKey` takes the wire's names; a schedule row calls its tip-off
 * `gameDateTimeUTC`, so the mapping is spelled out here rather than left to a
 * structural match that would quietly ignore the fallback.
 */
function slateDay(game: SlateGame): string | null {
  return slateDateKey({ gameDate: game.gameDate, gameDateTime: game.gameDateTimeUTC });
}

/** Tip-off in milliseconds, or Infinity for a game with no usable time. */
function tipOff(game: SlateGame): number {
  return game.gameDateTimeUTC?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * The games a guild's slate day contains, earliest tip-off first.
 *
 * `gameStatus = 1` is the schedule's "scheduled" code: a game that is live or
 * final is not something a reader can still pick. The tip-off cut is the second
 * half of the same idea — a 7:30 PM game the morning of is postable, the same
 * game at 11 PM is not.
 */
export function selectSlateGames(
  games: readonly SlateGame[],
  etKey: string,
  now: Date,
): SlateGame[] {
  return games
    .filter((game) => game.gameStatus === 1)
    .filter((game) => tipOff(game) > now.getTime())
    .filter((game) => slateDay(game) === etKey)
    .sort((left, right) => tipOff(left) - tipOff(right));
}

/** `Boston Celtics`, falling back to the tricode when the schedule has no name. */
function displayName(city: string | null, name: string | null, tricode: string | null): string {
  const full = [city, name]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  return full || tricode?.trim() || 'TBD';
}

/** A schedule row in the shape `cardPayload` takes. */
export function toCardGame(game: SlateGame): CardGame {
  return {
    id: game.gameId,
    awayTeam: displayName(game.awayTeamCity, game.awayTeamName, game.awayTeamTricode),
    homeTeam: displayName(game.homeTeamCity, game.homeTeamName, game.homeTeamTricode),
    awayTricode: game.awayTeamTricode,
    homeTricode: game.homeTeamTricode,
    gameDateTime: game.gameDateTimeUTC?.toISOString() ?? '',
    seriesText: game.seriesText,
  };
}

function sideTeam(
  game: SlateGame,
  side: 'away' | 'home',
  teams: ReadonlyMap<string, CardTeam>,
  stake: CardStake | undefined,
) {
  const tricode =
    (side === 'away' ? game.awayTeamTricode : game.homeTeamTricode)?.trim().toUpperCase() ?? '';
  const row = tricode ? teams.get(tricode) : undefined;
  const fallbackName = displayName(
    side === 'away' ? game.awayTeamCity : game.homeTeamCity,
    side === 'away' ? game.awayTeamName : game.homeTeamName,
    tricode,
  );

  return {
    tricode: row?.tricode ?? tricode,
    name: row?.name ?? fallbackName,
    logoUrl: row?.logoUrl ?? null,
    // Absent when the team has no `teams` row or no completed games yet: the card
    // drops that side's field rather than printing a dash where the record goes.
    record: row?.record ?? null,
    points: stake?.[side] ?? null,
  };
}

/**
 * Both sides of a card, using the `teams` rows where they exist.
 *
 * `stake` is what each side pays if picked right; a card built after tip-off has
 * none, because there is nothing left to pick.
 */
export function toCardTeams(
  game: SlateGame,
  teams: ReadonlyMap<string, CardTeam>,
  stake?: CardStake | null,
): CardTeams {
  return {
    away: sideTeam(game, 'away', teams, stake ?? undefined),
    home: sideTeam(game, 'home', teams, stake ?? undefined),
  };
}
