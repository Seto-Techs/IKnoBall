import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { predictionPicks, scheduleGames, user } from '@iknoball/database';
import {
  deVig,
  fairDecimal,
  potentialPoints,
  type OddsSide,
  type PredictionMode,
} from '@iknoball/predictions';
import { DatabaseService } from './infrastructure/database/database.service';
import { OddsService } from './odds.service';

/** `schedule_games.gameStatus`: 1 scheduled, 2 live, 3 final. */
const STATUS_SCHEDULED = 1;

/** Leaderboard depth, matching the dashboard's top-50 panel. */
const LEADERBOARD_SIZE = 50;

export interface PlacePickInput {
  gameId: string;
  side: OddsSide;
}

export interface LockedOdds {
  decimal: number;
  book: string;
  capturedAt: Date;
}

export interface PickRow {
  gameId: string;
  mode: PredictionMode;
  side: OddsSide;
  lockedDecimal: number | null;
  lockedBook: string | null;
  lockedAt: Date | null;
  points: number | null;
  status: string;
  settledAt: Date | null;
  /**
   * Weighted pick waiting for a price.
   *
   * True when the game had no usable odds at submit and the payout will be
   * resolved from the opening line once one appears. Never true for flat picks,
   * which need no price at all.
   */
  pendingPrice: boolean;
}

/** A weighted pick is deferred when it is open and still has no price. */
function isPendingPrice(row: {
  mode: PredictionMode;
  lockedDecimal: number | null;
  status: string;
}): boolean {
  return row.mode === 'weighted' && row.lockedDecimal === null && row.status === 'pending';
}

export interface PickWithGame extends PickRow {
  homeTeam: string | null;
  awayTeam: string | null;
  homeTricode: string | null;
  awayTricode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTime: Date | null;
  gameStatus: number | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  points: number;
  picks: number;
  correct: number;
}

export interface OddsPreviewSide {
  decimal: number;
  /** Points this side would pay in each mode if it wins. */
  flat: number;
  weighted: number;
}

export interface OddsPreview {
  gameId: string;
  available: boolean;
  book: string | null;
  capturedAt: Date | null;
  /** True when the newest price is older than the accepted window. */
  stale: boolean;
  home: OddsPreviewSide | null;
  away: OddsPreviewSide | null;
}

/** Columns every pick response carries, so the shape stays consistent. */
const PICK_COLUMNS = {
  gameId: predictionPicks.gameId,
  mode: predictionPicks.mode,
  side: predictionPicks.side,
  lockedDecimal: predictionPicks.lockedDecimal,
  lockedBook: predictionPicks.lockedBook,
  lockedAt: predictionPicks.lockedAt,
  points: predictionPicks.points,
  status: predictionPicks.status,
  settledAt: predictionPicks.settledAt,
};

@Injectable()
export class PredictionsService {
  private readonly maxOddsAgeMs = Number(process.env.ODDS_MAX_AGE_MINUTES || '20') * 60 * 1000;

  constructor(
    private readonly db: DatabaseService,
    private readonly odds: OddsService,
  ) {}

  /**
   * Place or replace a pick on a game, locking both modes together.
   *
   * Flat always locks, because it needs no price. Weighted locks the current
   * price when one is known; otherwise it is left without a price and resolved
   * from the opening line once one appears (see the worker's
   * `OddsSyncService.resolveDeferredPicks`).
   *
   * Both rows are written in one transaction, and both always name the same
   * side, so the modes cannot disagree.
   */
  async placePick(userId: string, input: PlacePickInput): Promise<PickRow[]> {
    await this.requireOpenGame(input.gameId);

    const locked = await this.tryLockOdds(input.gameId, input.side);
    const now = new Date();

    return this.db.db.transaction(async (tx) => {
      const write = async (mode: PredictionMode): Promise<PickRow> => {
        const lockedDecimal = mode === 'weighted' ? (locked?.decimal ?? null) : null;
        const lockedBook = mode === 'weighted' ? (locked?.book ?? null) : null;
        const lockedAt = mode === 'weighted' && locked ? now : null;

        const [row] = await tx
          .insert(predictionPicks)
          .values({
            userId,
            gameId: input.gameId,
            mode,
            side: input.side,
            lockedDecimal,
            lockedBook,
            lockedAt,
          })
          .onConflictDoUpdate({
            target: [predictionPicks.userId, predictionPicks.gameId, predictionPicks.mode],
            // Only the mutable fields: the conflict target is the identity.
            set: { side: input.side, lockedDecimal, lockedBook, lockedAt, updatedAt: now },
          })
          .returning(PICK_COLUMNS);

        return { ...row, pendingPrice: isPendingPrice(row) };
      };

      return [await write('flat'), await write('weighted')];
    });
  }

  /** Remove every mode for a game. Only allowed while the game is still open. */
  async removePick(userId: string, gameId: string): Promise<void> {
    await this.requireOpenGame(gameId);
    await this.db.db
      .delete(predictionPicks)
      .where(and(eq(predictionPicks.userId, userId), eq(predictionPicks.gameId, gameId)));
  }

  async listPicks(userId: string): Promise<PickWithGame[]> {
    const rows = await this.db.db
      .select({
        gameId: predictionPicks.gameId,
        mode: predictionPicks.mode,
        side: predictionPicks.side,
        lockedDecimal: predictionPicks.lockedDecimal,
        lockedBook: predictionPicks.lockedBook,
        lockedAt: predictionPicks.lockedAt,
        points: predictionPicks.points,
        status: predictionPicks.status,
        settledAt: predictionPicks.settledAt,
        homeTeam: scheduleGames.homeTeamName,
        awayTeam: scheduleGames.awayTeamName,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDateTime: scheduleGames.gameDateTimeUTC,
        gameStatus: scheduleGames.gameStatus,
      })
      .from(predictionPicks)
      // Left join: a postponed game's schedule row is deleted, and the pick must
      // still be listed as voided rather than vanishing.
      .leftJoin(scheduleGames, eq(scheduleGames.gameId, predictionPicks.gameId))
      .where(eq(predictionPicks.userId, userId))
      .orderBy(desc(predictionPicks.createdAt));

    return rows.map((row) => ({ ...row, pendingPrice: isPendingPrice(row) }));
  }

  /**
   * Standings for one mode. Voided picks are excluded so a postponement neither
   * helps nor hurts.
   */
  async leaderboard(mode: PredictionMode): Promise<LeaderboardRow[]> {
    const rows = await this.db.db
      .select({
        userId: predictionPicks.userId,
        name: user.name,
        points: sql<number>`coalesce(sum(${predictionPicks.points}), 0)::int`,
        picks: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${predictionPicks.points} > 0)::int`,
      })
      .from(predictionPicks)
      .innerJoin(user, eq(user.id, predictionPicks.userId))
      .where(and(eq(predictionPicks.mode, mode), eq(predictionPicks.status, 'settled')))
      .groupBy(predictionPicks.userId, user.name)
      .orderBy(desc(sql`coalesce(sum(${predictionPicks.points}), 0)`))
      .limit(LEADERBOARD_SIZE);

    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  }

  /** Current price and what each side would pay, for the pick UI. */
  async oddsPreview(gameId: string): Promise<OddsPreview> {
    const snapshot = await this.odds.getGameOdds(gameId);
    if (!snapshot) {
      return {
        gameId,
        available: false,
        book: null,
        capturedAt: null,
        stale: false,
        home: null,
        away: null,
      };
    }

    const stale = Date.now() - snapshot.capturedAt.getTime() > this.maxOddsAgeMs;
    const fair = deVig(snapshot.homeDecimal, snapshot.awayDecimal);
    const side = (decimal: number): OddsPreviewSide => ({
      decimal,
      flat: potentialPoints('flat', null),
      weighted: potentialPoints('weighted', decimal),
    });

    return {
      gameId,
      available: true,
      book: `${snapshot.bookName}/${snapshot.bookCountry}`,
      capturedAt: snapshot.capturedAt,
      stale,
      home: side(fair.home),
      away: side(fair.away),
    };
  }

  /**
   * The game must still be scheduled and not yet tipped off.
   *
   * The cutoff is the exact tip-off instant with no buffer. `gameStatus` is kept
   * fresh by the worker, which also covers a delayed start: a game that has
   * begun is no longer status 1, so it closes even if its scheduled time passed
   * without the clock advancing.
   */
  private async requireOpenGame(gameId: string) {
    const [game] = await this.db.db
      .select({
        gameId: scheduleGames.gameId,
        gameStatus: scheduleGames.gameStatus,
        gameDateTimeUTC: scheduleGames.gameDateTimeUTC,
      })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, gameId))
      .limit(1);

    if (!game) {
      throw new NotFoundException(`Game '${gameId}' not found`);
    }
    if (game.gameStatus !== STATUS_SCHEDULED) {
      throw new BadRequestException('Picks are closed: this game is no longer scheduled.');
    }
    if (!game.gameDateTimeUTC) {
      throw new BadRequestException('Picks are closed: this game has no tip-off time.');
    }
    if (Date.now() >= game.gameDateTimeUTC.getTime()) {
      throw new BadRequestException('Picks are closed: tip-off has passed.');
    }

    return game;
  }

  /**
   * Price to lock for a weighted pick, or null when there is nothing to lock.
   *
   * Any stored price beats the fallback: the fallback is the *opening* line,
   * which is older than even a stale snapshot, so gating on age here would
   * systematically hand out worse information. Returns null only when no price
   * is known at all, which defers the payout to the opening line.
   */
  private async tryLockOdds(gameId: string, side: OddsSide): Promise<LockedOdds | null> {
    const snapshot = await this.odds.getGameOdds(gameId);
    if (!snapshot) return null;

    return {
      decimal: fairDecimal(snapshot.homeDecimal, snapshot.awayDecimal, side),
      book: `${snapshot.bookName}/${snapshot.bookCountry}`,
      capturedAt: snapshot.capturedAt,
    };
  }
}
