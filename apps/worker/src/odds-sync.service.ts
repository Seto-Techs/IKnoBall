import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { gameOddsSnapshots, predictionPicks, scheduleGames } from '@iknoball/database';
import { fairDecimal } from '@iknoball/predictions';
import { DatabaseService } from './database.service';
import { FallbackOddsProvider } from './fallback-odds.provider';
import type { OddsGame, OddsProvider } from '@iknoball/predictions';

export interface OddsSyncResult {
  /** Games the feed returned with at least one priceable book. */
  fetched: number;
  /** Games matched to a row in `schedule_games`. */
  resolved: number;
  /** Snapshot rows written. */
  written: number;
  /** Deferred weighted picks that received a price on this pass. */
  priced: number;
}

/**
 * Persists moneyline odds so a pick's price can be locked and later audited.
 *
 * Pinnacle is the primary source and the NBA CDN is the fallback (see
 * `FallbackOddsProvider`). Neither feed exposes history, so every fetch is
 * stored. A game that cannot be matched to the schedule is dropped rather than
 * guessed at.
 */
@Injectable()
export class OddsSyncService {
  private readonly logger = new Logger(OddsSyncService.name);
  private readonly timeZone = process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York';
  private readonly enabled = process.env.ODDS_SYNC_ENABLED !== 'false';
  private readonly windowDaysBefore = Number(process.env.ODDS_MATCH_WINDOW_DAYS_BEFORE || '3');
  private readonly windowDaysAfter = Number(process.env.ODDS_MATCH_WINDOW_DAYS_AFTER || '7');
  private readonly preferredBook = process.env.ODDS_PREFERRED_BOOK || 'FanDuel';

  /** Single-process guard; the worker runs one instance per deployment. */
  private inFlight = false;

  constructor(
    @Inject(FallbackOddsProvider) private readonly oddsProvider: OddsProvider,
    private readonly database: DatabaseService,
  ) {}

  @Cron(process.env.ODDS_SYNC_CRON || '*/5 * * * *', {
    timeZone: process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York',
  })
  async oddsSyncCron() {
    if (!this.enabled) return;
    if (this.inFlight) {
      this.logger.warn('odds sync skipped: previous run still in flight');
      return;
    }

    this.inFlight = true;
    try {
      await this.syncOdds();
    } catch (error) {
      this.logger.error('odds sync failed', error as Error);
    } finally {
      this.inFlight = false;
    }
  }

  async syncOdds(now: Date = new Date()): Promise<OddsSyncResult> {
    const startedAt = Date.now();
    const capturedAt = new Date();
    const games = await this.oddsProvider.fetchMoneyline();

    let matched = 0;
    let written = 0;

    if (!games.length) {
      // The feed is empty in the offseason and when Akamai blocks the request.
      this.logger.warn('odds sync: feed returned no moneyline games');
    } else {
      const resolved = await this.resolveGameIds(games, now);
      const rows: Array<typeof gameOddsSnapshots.$inferInsert> = [];

      for (const game of resolved) {
        if (!game.gameId) continue;
        matched += 1;
        for (const book of game.books) {
          rows.push({
            gameId: game.gameId,
            bookName: book.bookName,
            bookCountry: book.countryCode,
            homeDecimal: book.home,
            awayDecimal: book.away,
            homeOpeningDecimal: book.homeOpening,
            awayOpeningDecimal: book.awayOpening,
            capturedAt,
          });
        }
      }

      if (!rows.length) {
        this.logger.warn(`odds sync: no games matched the schedule (fetched=${games.length})`);
      } else {
        const inserted = await this.database.db
          .insert(gameOddsSnapshots)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: gameOddsSnapshots.id });
        written = inserted.length;
      }
    }

    // Runs after the insert so a price captured on this pass can be used
    // immediately, and still runs when the feed is empty so a game priced by an
    // earlier pass is not left waiting.
    const priced = await this.resolveDeferredPicks();

    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `odds sync done fetched=${games.length} resolved=${matched} written=${written} priced=${priced} span=${spanSeconds}s`,
    );

    return { fetched: games.length, resolved: matched, written, priced };
  }

  /**
   * Lock a price onto weighted picks that were placed before any odds existed.
   *
   * The opening line is used in preference to the current one, because that is
   * the price the user was promised when their pick was accepted without a
   * price. Falls back to the current line only when the feed carried no opening
   * value for the book.
   *
   * Only touches rows that still have no price, so it is safe to run repeatedly.
   */
  async resolveDeferredPicks(): Promise<number> {
    const deferred = await this.database.db
      .select({
        id: predictionPicks.id,
        gameId: predictionPicks.gameId,
        side: predictionPicks.side,
      })
      .from(predictionPicks)
      .where(
        and(
          eq(predictionPicks.status, 'pending'),
          eq(predictionPicks.mode, 'weighted'),
          isNull(predictionPicks.lockedDecimal),
        ),
      );

    if (!deferred.length) return 0;

    const byGame = new Map<string, typeof deferred>();
    for (const pick of deferred) {
      const list = byGame.get(pick.gameId);
      if (list) list.push(pick);
      else byGame.set(pick.gameId, [pick]);
    }

    const now = new Date();
    let priced = 0;

    for (const [gameId, picks] of byGame) {
      const snapshot = await this.newestSnapshot(gameId);
      if (!snapshot) continue;

      const home = snapshot.homeOpeningDecimal ?? snapshot.homeDecimal;
      const away = snapshot.awayOpeningDecimal ?? snapshot.awayDecimal;

      for (const pick of picks) {
        await this.database.db
          .update(predictionPicks)
          .set({
            lockedDecimal: fairDecimal(home, away, pick.side),
            lockedBook: `${snapshot.bookName}/${snapshot.bookCountry}`,
            lockedAt: now,
            updatedAt: now,
          })
          .where(and(eq(predictionPicks.id, pick.id), isNull(predictionPicks.lockedDecimal)));
        priced += 1;
      }
    }

    if (priced > 0) {
      this.logger.log(`resolveDeferredPicks priced=${priced} games=${byGame.size}`);
    }
    return priced;
  }

  /** Newest stored price for a game, preferring the configured book. */
  private async newestSnapshot(gameId: string) {
    const columns = {
      bookName: gameOddsSnapshots.bookName,
      bookCountry: gameOddsSnapshots.bookCountry,
      homeDecimal: gameOddsSnapshots.homeDecimal,
      awayDecimal: gameOddsSnapshots.awayDecimal,
      homeOpeningDecimal: gameOddsSnapshots.homeOpeningDecimal,
      awayOpeningDecimal: gameOddsSnapshots.awayOpeningDecimal,
    };

    const [preferred] = await this.database.db
      .select(columns)
      .from(gameOddsSnapshots)
      .where(
        and(
          eq(gameOddsSnapshots.gameId, gameId),
          eq(gameOddsSnapshots.bookName, this.preferredBook),
        ),
      )
      .orderBy(desc(gameOddsSnapshots.capturedAt))
      .limit(1);

    if (preferred) return preferred;

    // Some games are only priced by one book.
    const [fallback] = await this.database.db
      .select(columns)
      .from(gameOddsSnapshots)
      .where(eq(gameOddsSnapshots.gameId, gameId))
      .orderBy(desc(gameOddsSnapshots.capturedAt))
      .limit(1);

    return fallback ?? null;
  }

  /**
   * Fill in `gameId` for entries that omit it, by matching the team pair
   * against the schedule inside a bounded date window.
   */
  private async resolveGameIds(games: OddsGame[], now: Date): Promise<OddsGame[]> {
    if (!games.some((game) => !game.gameId)) return games;

    const from = this.dateKey(this.shiftDays(now, -this.windowDaysBefore));
    const to = this.dateKey(this.shiftDays(now, this.windowDaysAfter));

    const candidates = await this.database.db
      .select({
        gameId: scheduleGames.gameId,
        homeTeamId: scheduleGames.homeTeamId,
        awayTeamId: scheduleGames.awayTeamId,
      })
      .from(scheduleGames)
      .where(and(gte(scheduleGames.gameDate, from), lte(scheduleGames.gameDate, to)));

    const byTeams = new Map<string, string>();
    for (const candidate of candidates) {
      if (candidate.homeTeamId === null || candidate.awayTeamId === null) continue;
      byTeams.set(`${candidate.homeTeamId}:${candidate.awayTeamId}`, candidate.gameId);
    }

    return games.map((game) => {
      if (game.gameId) return game;
      if (game.homeTeamId === null || game.awayTeamId === null) return game;
      const gameId = byTeams.get(`${game.homeTeamId}:${game.awayTeamId}`);
      return gameId ? { ...game, gameId } : game;
    });
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
