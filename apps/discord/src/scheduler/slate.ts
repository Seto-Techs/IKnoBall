/**
 * Which games are on a guild's slate today, and how they fit into messages.
 *
 * Pure: no database, no gateway, no clock. The scheduler hands in rows and an
 * instant, so a test can pin the selection at any hour of any day.
 *
 * Two Discord limits shape the second half. A message may carry at most 10
 * embeds but only **5 action rows**, and every card spends one row on its three
 * buttons, so four cards is the widest slate that fits one message. Past that the
 * remainder goes to a thread rather than a second message in the channel, which
 * keeps one day's slate in one conversation (DISC-10).
 */
import type { CardGame, CardTeam, CardTeams } from '../cards/types';
import { slateDateKey } from './slate-date';

/** Cards per message: one action row each, under Discord's cap of five. */
export const CARDS_PER_MESSAGE = 4;

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

/**
 * Split a slate into one message's worth of cards at a time.
 *
 * `[[a,b,c,d], [e,f]]` for six games: the first chunk is the channel message and
 * every later chunk belongs in its thread. An empty slate is no chunks at all,
 * which is how "post nothing on an empty day" stays a single rule.
 */
export function splitSlate(
  games: readonly SlateGame[],
  perMessage: number = CARDS_PER_MESSAGE,
): SlateGame[][] {
  if (perMessage < 1) throw new RangeError('perMessage must be at least 1');

  const chunks: SlateGame[][] = [];
  for (let index = 0; index < games.length; index += perMessage) {
    chunks.push(games.slice(index, index + perMessage));
  }
  return chunks;
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

function sideTeam(game: SlateGame, side: 'away' | 'home', teams: ReadonlyMap<string, CardTeam>) {
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
    // No season record on this side of the wire: the W-L column comes from the
    // backend's standings/teams controllers, which this chunk does not own, and
    // the card already renders a dash when a record is absent. Guessing one from
    // final games would fork the standings logic into the bot.
    record: null,
  };
}

/** Both sides of a card, using the `teams` rows where they exist. */
export function toCardTeams(game: SlateGame, teams: ReadonlyMap<string, CardTeam>): CardTeams {
  return { away: sideTeam(game, 'away', teams), home: sideTeam(game, 'home', teams) };
}
