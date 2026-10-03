import { Injectable, Logger } from '@nestjs/common';
import { teams } from '@iknoball/database';
import {
  fetchPinnacleLeague,
  findPinnacleGame,
  indexTeamIds,
  pinnacleLeagueForGameId,
  PINNACLE_BOOK,
  type OddsBook,
} from '@iknoball/predictions';
import { DatabaseService } from './infrastructure/database/database.service';

/**
 * Pinnacle as an on-demand fallback for the NBA CDN.
 *
 * The CDN file only lists games a bookmaker has actually posted, and it is
 * sparse in preseason — a slate can have twelve games and one price. When a
 * game is missing there, this resolves Pinnacle's league for that game and
 * returns its price, so a cache miss still fetches something live instead of
 * falling back to whatever the worker last polled.
 *
 * The league comes from the game id (`001` preseason, everything else the main
 * league), so this is a single league fetch per lookup.
 */
@Injectable()
export class PinnacleOddsService {
  private readonly logger = new Logger(PinnacleOddsService.name);
  private readonly requestTimeoutMs = Number(process.env.ODDS_REQUEST_TIMEOUT_MS || '15000');

  constructor(private readonly database: DatabaseService) {}

  /**
   * Pinnacle's book for one game, in the same shape `pickBook` returns, or null
   * when Pinnacle has not posted a price for it.
   *
   * Opening odds are null: this feed carries only the current line.
   */
  async findBook(
    gameId: string,
    homeTeamId: number | null,
    awayTeamId: number | null,
  ): Promise<OddsBook | null> {
    if (homeTeamId === null || awayTeamId === null) return null;

    const league = pinnacleLeagueForGameId(gameId);
    const games = await fetchPinnacleLeague(league, this.requestTimeoutMs);
    if (!games.length) return null;

    const rows = await this.database.db
      .select({ fullName: teams.fullName, externalId: teams.externalId })
      .from(teams);

    const game = findPinnacleGame(games, indexTeamIds(rows), homeTeamId, awayTeamId);
    if (!game) return null;

    return {
      bookId: PINNACLE_BOOK.bookId,
      bookName: PINNACLE_BOOK.bookName,
      countryCode: PINNACLE_BOOK.countryCode,
      home: game.home,
      away: game.away,
      homeOpening: null,
      awayOpening: null,
    };
  }
}
