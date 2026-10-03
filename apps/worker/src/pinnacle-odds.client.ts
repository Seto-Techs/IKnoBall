import { Injectable, Logger } from '@nestjs/common';
import { and, gte, lte } from 'drizzle-orm';
import { scheduleGames, teams } from '@iknoball/database';
import {
  fetchPinnacleOdds,
  indexTeamIds,
  PINNACLE_BOOK,
  pinnacleLeagueForGameId,
  type OddsGame,
  type OddsProvider,
} from '@iknoball/predictions';
import { DatabaseService } from './database.service';

/**
 * Pinnacle, as a fallback for games the NBA CDN has not priced.
 *
 * Only the leagues the current slate actually needs are fetched: preseason
 * games are priced under Pinnacle's preseason league and everything else under
 * the main NBA league, so the game ids in the sync window decide which ids to
 * call. During the preseason-to-regular-season crossover the window can contain
 * both, and then both are fetched.
 *
 * Pinnacle identifies teams by name, so each participant is mapped to an NBA
 * team id through `teams.fullName`. A name that does not resolve is dropped: a
 * game we cannot identify is not a game we can price.
 */
@Injectable()
export class PinnacleOddsClient implements OddsProvider {
  private readonly logger = new Logger(PinnacleOddsClient.name);
  private readonly timeZone = process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York';
  private readonly requestTimeoutMs = Number(process.env.ODDS_REQUEST_TIMEOUT_MS || '15000');
  private readonly windowDaysBefore = Number(process.env.ODDS_MATCH_WINDOW_DAYS_BEFORE || '3');
  private readonly windowDaysAfter = Number(process.env.ODDS_MATCH_WINDOW_DAYS_AFTER || '7');

  constructor(private readonly database: DatabaseService) {}

  async fetchMoneyline(now: Date = new Date()): Promise<OddsGame[]> {
    const leagues = await this.leaguesOnSlate(now);
    if (!leagues.length) return [];

    const games = await fetchPinnacleOdds(leagues, this.requestTimeoutMs);
    if (!games.length) return [];

    const teamIds = await this.teamIdsByName();
    const priced: OddsGame[] = [];

    for (const game of games) {
      const homeTeamId = teamIds.get(game.homeTeamName);
      const awayTeamId = teamIds.get(game.awayTeamName);
      if (homeTeamId === undefined || awayTeamId === undefined) {
        this.logger.warn(
          `Pinnacle game skipped: unresolved team name ${game.homeTeamName} / ${game.awayTeamName}`,
        );
        continue;
      }

      priced.push({
        // Pinnacle carries no NBA game id; the caller matches on the team pair.
        gameId: null,
        homeTeamId,
        awayTeamId,
        books: [
          {
            bookId: PINNACLE_BOOK.bookId,
            bookName: PINNACLE_BOOK.bookName,
            countryCode: PINNACLE_BOOK.countryCode,
            home: game.home,
            away: game.away,
            // This feed publishes no opening line.
            homeOpening: null,
            awayOpening: null,
          },
        ],
      });
    }

    return priced;
  }

  /** Distinct Pinnacle leagues the games in the sync window belong to. */
  private async leaguesOnSlate(now: Date): Promise<number[]> {
    const from = this.dateKey(this.shiftDays(now, -this.windowDaysBefore));
    const to = this.dateKey(this.shiftDays(now, this.windowDaysAfter));

    const rows = await this.database.db
      .select({ gameId: scheduleGames.gameId })
      .from(scheduleGames)
      .where(and(gte(scheduleGames.gameDate, from), lte(scheduleGames.gameDate, to)));

    return [...new Set(rows.map((row) => pinnacleLeagueForGameId(row.gameId)))];
  }

  /** Pinnacle team name → NBA team id, keyed on `teams.fullName`. */
  private async teamIdsByName(): Promise<Map<string, number>> {
    const rows = await this.database.db
      .select({ fullName: teams.fullName, externalId: teams.externalId })
      .from(teams);

    return indexTeamIds(rows);
  }

  private shiftDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private dateKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
