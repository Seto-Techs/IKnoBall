import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray } from 'drizzle-orm';
import { predictionPicks, scheduleGames } from '@iknoball/database';
import { pointsFor, type PredictionMode } from '@iknoball/predictions';
import { DatabaseService } from './database.service';

export interface SettlementResult {
  /** Picks scored against a final result. */
  settled: number;
  /** Picks cancelled because the game never reached a final state. */
  voided: number;
  /** Pending picks left alone: not final, not yet past the void threshold. */
  pending: number;
}

/** `schedule_games.gameStatus`: 1 scheduled, 2 live, 3 final. */
const STATUS_FINAL = 3;

interface PendingPick {
  id: string;
  mode: PredictionMode;
  side: 'home' | 'away';
  lockedDecimal: number | null;
  gameStatus: number | null;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTimeUTC: Date | null;
}

/**
 * Scores settled picks and voids abandoned ones.
 *
 * Settlement reads only `lockedDecimal`, never live odds, so the price a user
 * accepted at submit is exactly what they are paid on.
 *
 * Picks are voided when the game never produced a readable result: its schedule
 * row is gone, it is long past its tip-off without finishing, or it is marked
 * final but the score never arrived. All count as neither a win nor a loss and
 * drop out of the leaderboard.
 */
@Injectable()
export class PredictionSettlementService {
  private readonly logger = new Logger(PredictionSettlementService.name);
  private readonly enabled = process.env.PREDICTION_SETTLEMENT_ENABLED !== 'false';

  /**
   * How long after tip-off a pick may stay unsettleable before it is voided.
   * Wide enough that a delayed or suspended game is never voided early.
   */
  private readonly voidAfterHours = Number(process.env.PREDICTION_VOID_AFTER_HOURS || '48');
  private readonly voidAfterMs = this.voidAfterHours * 60 * 60 * 1000;

  /** Single-process guard; the worker runs one instance per deployment. */
  private inFlight = false;

  constructor(private readonly database: DatabaseService) {}

  @Cron(process.env.PREDICTION_SETTLEMENT_CRON || '*/15 * * * *', {
    timeZone: process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York',
  })
  async settlementCron() {
    if (!this.enabled) return;
    if (this.inFlight) {
      this.logger.warn('settlement skipped: previous run still in flight');
      return;
    }

    this.inFlight = true;
    try {
      await this.settlePending();
    } catch (error) {
      this.logger.error('settlement failed', error as Error);
    } finally {
      this.inFlight = false;
    }
  }

  async settlePending(now: Date = new Date()): Promise<SettlementResult> {
    const startedAt = Date.now();

    // Left join so a pick whose schedule row was deleted still comes back and
    // can be voided rather than silently stranded.
    const rows = await this.database.db
      .select({
        id: predictionPicks.id,
        mode: predictionPicks.mode,
        side: predictionPicks.side,
        lockedDecimal: predictionPicks.lockedDecimal,
        gameStatus: scheduleGames.gameStatus,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameDateTimeUTC: scheduleGames.gameDateTimeUTC,
      })
      .from(predictionPicks)
      .leftJoin(scheduleGames, eq(scheduleGames.gameId, predictionPicks.gameId))
      .where(eq(predictionPicks.status, 'pending'));

    const settlements: Array<{ id: string; points: number }> = [];
    const voids: string[] = [];
    let pending = 0;

    for (const row of rows as PendingPick[]) {
      // No schedule row: the game was dropped from the feed, so it was
      // postponed or cancelled and will never produce a result.
      if (row.gameStatus === null) {
        voids.push(row.id);
        continue;
      }

      if (row.gameStatus === STATUS_FINAL) {
        // A weighted pick with no price can never be scored: the payout is a
        // function of the price. Voiding is honest; scoring it 0 would punish a
        // correct pick for a feed gap.
        if (row.mode === 'weighted' && row.lockedDecimal === null) {
          this.logger.warn(`pick=${row.id} weighted pick has no price; voiding`);
          voids.push(row.id);
          continue;
        }

        const points = this.scorePick(row);
        if (points !== null) {
          settlements.push({ id: row.id, points });
          continue;
        }

        // Final, but the result is unreadable: the score is missing, or the row
        // still holds the 0-0 placeholder the schedule feed writes for a game
        // that has not been played. The boxscore crawler normally corrects this
        // within minutes, so it is usually transient; past the threshold it is a
        // feed gap that will not heal, and leaving the pick pending would strand
        // it off the leaderboard forever.
        if (this.pastVoidThreshold(row, now)) {
          this.logger.warn(
            `pick=${row.id} final game has an unreadable score past ${this.voidAfterHours}h; voiding`,
          );
          voids.push(row.id);
          continue;
        }

        pending += 1;
        continue;
      }

      // Backstop for a game that stays non-final forever. The daily schedule
      // sync only reconciles today, so a game postponed on an earlier day is
      // never cleaned up; this is what catches it.
      if (this.pastVoidThreshold(row, now)) {
        voids.push(row.id);
        continue;
      }

      pending += 1;
    }

    if (settlements.length || voids.length) {
      await this.database.db.transaction(async (tx) => {
        for (const settlement of settlements) {
          // Re-assert `pending` so a concurrent run cannot double-settle.
          await tx
            .update(predictionPicks)
            .set({ points: settlement.points, status: 'settled', settledAt: now, updatedAt: now })
            .where(
              and(eq(predictionPicks.id, settlement.id), eq(predictionPicks.status, 'pending')),
            );
        }

        if (voids.length) {
          await tx
            .update(predictionPicks)
            .set({ points: null, status: 'voided', settledAt: now, updatedAt: now })
            .where(and(inArray(predictionPicks.id, voids), eq(predictionPicks.status, 'pending')));
        }
      });
    }

    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `settlement done settled=${settlements.length} voided=${voids.length} pending=${pending} span=${spanSeconds}s`,
    );

    return { settled: settlements.length, voided: voids.length, pending };
  }

  /**
   * Whether a pick has been unsettleable for longer than the void threshold,
   * measured from tip-off.
   *
   * A pick with no tip-off time can never cross the threshold, so it stays
   * pending rather than being voided on a guess.
   */
  private pastVoidThreshold(row: PendingPick, now: Date): boolean {
    const tipoff = row.gameDateTimeUTC?.getTime();
    return tipoff !== undefined && tipoff !== null && now.getTime() - tipoff > this.voidAfterMs;
  }

  /**
   * Points for a final game, or null when the result cannot be read.
   *
   * A tied score is not a possible NBA result; treat it as unreadable rather
   * than guessing a winner.
   */
  private scorePick(row: PendingPick): number | null {
    const { homeScore, awayScore } = row;
    if (homeScore === null || awayScore === null) {
      this.logger.warn(`pick=${row.id} final game has no score; leaving pending`);
      return null;
    }
    if (homeScore === awayScore) {
      this.logger.warn(
        `pick=${row.id} final game is tied ${homeScore}-${awayScore}; leaving pending`,
      );
      return null;
    }

    const winner = homeScore > awayScore ? 'home' : 'away';
    return pointsFor(row.mode, row.lockedDecimal, row.side === winner);
  }
}
