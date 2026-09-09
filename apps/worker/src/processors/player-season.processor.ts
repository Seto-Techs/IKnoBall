import { playerSeasonStats, players } from '@iknoball/database';
import { and, eq } from 'drizzle-orm';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../redis.service';
import { PlayerIndexClient } from '../player-index.client';
import { DatabaseService } from '../database.service';
import { QueueService, QUEUE_NAMES } from '../queue.service';

export type PlayerDashboardRow = {
  GROUP_SET: string;
  GROUP_VALUE: string;
  TEAM_ID: number | null;
  TEAM_ABBREVIATION: string | null;
  MAX_GAME_DATE: string | null;
  GP: number | null;
  W: number | null;
  L: number | null;
  W_PCT: number | null;
  MIN: number | null;
  FGM: number | null;
  FGA: number | null;
  FG_PCT: number | null;
  FG3M: number | null;
  FG3A: number | null;
  FG3_PCT: number | null;
  FTM: number | null;
  FTA: number | null;
  FT_PCT: number | null;
  OREB: number | null;
  DREB: number | null;
  REB: number | null;
  AST: number | null;
  TOV: number | null;
  STL: number | null;
  BLK: number | null;
  BLKA: number | null;
  PF: number | null;
  PFD: number | null;
  PTS: number | null;
  PLUS_MINUS: number | null;
  NBA_FANTASY_PTS: number | null;
  DD2: number | null;
  TD3: number | null;
  WNBA_FANTASY_PTS: number | null;
  GP_RANK: number | null;
  W_RANK: number | null;
  L_RANK: number | null;
  W_PCT_RANK: number | null;
  MIN_RANK: number | null;
  FGM_RANK: number | null;
  FGA_RANK: number | null;
  FG_PCT_RANK: number | null;
  FG3M_RANK: number | null;
  FG3A_RANK: number | null;
  FG3_PCT_RANK: number | null;
  FTM_RANK: number | null;
  FTA_RANK: number | null;
  FT_PCT_RANK: number | null;
  OREB_RANK: number | null;
  DREB_RANK: number | null;
  REB_RANK: number | null;
  AST_RANK: number | null;
  TOV_RANK: number | null;
  STL_RANK: number | null;
  BLK_RANK: number | null;
  BLKA_RANK: number | null;
  PF_RANK: number | null;
  PFD_RANK: number | null;
  PTS_RANK: number | null;
  PLUS_MINUS_RANK: number | null;
  NBA_FANTASY_PTS_RANK: number | null;
  DD2_RANK: number | null;
  TD3_RANK: number | null;
  WNBA_FANTASY_PTS_RANK: number | null;
};

/** Column values for one player_season_stats row, derived from a totals snapshot. */
export type SeasonTotals = {
  gp: number;
  wins?: number | null;
  losses?: number | null;
  fgPct?: number | null;
  fg3Pct?: number | null;
  ftPct?: number | null;
  ptsTotal?: number | null;
  rebTotal?: number | null;
  astTotal?: number | null;
  stlTotal?: number | null;
  blkTotal?: number | null;
  ptsPerGame?: number | null;
  rebPerGame?: number | null;
  astPerGame?: number | null;
  stlPerGame?: number | null;
  blkPerGame?: number | null;
};

/** Map a ByYear dashboard row to storable totals; null when nothing to store. */
export function toSeasonTotals(row: PlayerDashboardRow): SeasonTotals | null {
  const gp = row.GP ?? null;
  if (!gp || gp <= 0) {
    return null;
  }
  const ptsTotal = row.PTS ?? null;
  const rebTotal = row.REB ?? null;
  const astTotal = row.AST ?? null;
  const stlTotal = row.STL ?? null;
  const blkTotal = row.BLK ?? null;
  if ([ptsTotal, rebTotal, astTotal, stlTotal, blkTotal].every((v) => v === null)) {
    return null;
  }

  return {
    gp,
    wins: row.W ?? null,
    losses: row.L ?? null,
    fgPct: row.FG_PCT ?? null,
    fg3Pct: row.FG3_PCT ?? null,
    ftPct: row.FT_PCT ?? null,
    ptsTotal,
    rebTotal,
    astTotal,
    stlTotal,
    blkTotal,
    ptsPerGame: ptsTotal !== null ? ptsTotal / gp : null,
    rebPerGame: rebTotal !== null ? rebTotal / gp : null,
    astPerGame: astTotal !== null ? astTotal / gp : null,
    stlPerGame: stlTotal !== null ? stlTotal / gp : null,
    blkPerGame: blkTotal !== null ? blkTotal / gp : null,
  };
}

export type UpsertSeasonTotalsOutcome = 'inserted' | 'updated' | 'skipped';

/**
 * Write one player_season_stats row from a totals snapshot. Missing keys in
 * `totals` (e.g. wins/losses when the source is the leagueleaders API) are
 * left untouched on update.
 *
 * - No existing row -> insert.
 * - `alwaysRefresh` (the live current season) -> always overwrite.
 * - Otherwise (completed seasons) -> update only when the snapshot advanced,
 *   i.e. has more GP than the stored row. Per-season stats only accumulate,
 *   so this heals rows written mid-season without churning finished rows.
 */
export async function upsertSeasonTotals(
  db: DatabaseService['db'],
  params: { playerId: string; season: string; statsTimeframe: string },
  totals: SeasonTotals,
  opts: { alwaysRefresh?: boolean } = {},
): Promise<UpsertSeasonTotalsOutcome> {
  const key = and(
    eq(playerSeasonStats.playerId, params.playerId),
    eq(playerSeasonStats.season, params.season),
    eq(playerSeasonStats.statsTimeframe, params.statsTimeframe),
  );
  const [existing] = await db
    .select({ gp: playerSeasonStats.gp })
    .from(playerSeasonStats)
    .where(key);

  if (!existing) {
    await db.insert(playerSeasonStats).values({ ...params, ...totals });
    return 'inserted';
  }

  if (!opts.alwaysRefresh && (totals.gp ?? 0) <= (existing.gp ?? 0)) {
    return 'skipped';
  }

  // updatedAt is a plain defaultNow() column, so it must be set explicitly
  // on updates — otherwise refreshed rows still look stale to monitoring.
  await db
    .update(playerSeasonStats)
    .set({ ...totals, updatedAt: new Date() })
    .where(key);
  return 'updated';
}

@Injectable()
export class PlayerSeasonProcessor implements OnModuleInit {
  private readonly logger = new Logger(PlayerSeasonProcessor.name);
  private readonly currentSeason = process.env.NBA_CURRENT_SEASON || '';
  private readonly maxRetryAttempts = 5;
  private readonly retryDelayMs = 60000;

  constructor(
    private readonly redisService: RedisService,
    private readonly playerIndexClient: PlayerIndexClient,
    private readonly database: DatabaseService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    new Worker(
      QUEUE_NAMES.crawlPlayerCareer,
      async (job) => {
        const { playerExternalId, attempt = 0 } = job.data as {
          playerExternalId: string;
          attempt?: number;
        };

        await this.crawlPlayerCareer(playerExternalId, attempt);
      },
      { connection, concurrency: 2 },
    ).on('failed', (job, error) => {
      this.logger.error(`crawlPlayerCareer failed: ${job?.id}`, error);
    });
  }

  private async crawlPlayerCareer(playerExternalId: string, attempt: number) {
    if (!this.currentSeason) {
      throw new Error('NBA_CURRENT_SEASON is required');
    }
    const startedAt = Date.now();
    this.logger.log(`crawlPlayerCareer start player=${playerExternalId}`);
    const [player] = await this.database.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.externalId, playerExternalId));
    if (!player) {
      this.logger.warn(`Player not found for externalId ${playerExternalId}`);
      return;
    }
    try {
      await this.syncDashboardByYear(
        player.id,
        playerExternalId,
        'Regular Season',
        'ByYear-regular',
      );
      await this.syncDashboardByYear(player.id, playerExternalId, 'Playoffs', 'ByYear-playoffs');
      const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
      this.logger.log(`crawlPlayerCareer done player=${playerExternalId} span=${spanSeconds}s`);
    } catch (error) {
      if (this.isRetryable(error) && attempt < this.maxRetryAttempts) {
        const nextAttempt = attempt + 1;
        const jobId = `career-${playerExternalId}-retry-${nextAttempt}-${Date.now()}`;
        await this.queueService.enqueuePlayerCareer(playerExternalId, {
          delay: this.retryDelayMs,
          attempt: nextAttempt,
          jobId,
        });
        this.logger.warn(
          `requeue crawlPlayerCareer player=${playerExternalId} attempt=${nextAttempt}/${this.maxRetryAttempts} delay=60s`,
        );
        return;
      }

      const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
      this.logger.error(
        `crawlPlayerCareer failed player=${playerExternalId} span=${spanSeconds}s`,
        error as Error,
      );
      throw error;
    }
  }

  private async syncDashboardByYear(
    playerId: string,
    playerExternalId: string,
    seasonType: string,
    statsTimeframe: string,
  ) {
    const response = await this.playerIndexClient.fetchPlayerDashboardByYear(
      playerExternalId,
      this.currentSeason,
      seasonType,
    );
    const resultSet = response.resultSets.find((set) => set.name === 'ByYearPlayerDashboard');
    if (!resultSet) {
      this.logger.warn(
        `ByYearPlayerDashboard result set missing for ${playerExternalId} ${seasonType}`,
      );
      return;
    }

    const rows = this.mapDashboardRows(resultSet.headers, resultSet.rowSet);
    await this.persistDashboardRows(playerId, rows, statsTimeframe);
  }

  private async persistDashboardRows(
    playerId: string,
    rows: PlayerDashboardRow[],
    statsTimeframe: string,
  ) {
    const currentSeason = this.currentSeason;
    for (const row of rows) {
      if (!row.GROUP_VALUE) {
        continue;
      }

      const totals = toSeasonTotals(row);
      if (!totals) {
        continue;
      }

      await upsertSeasonTotals(
        this.database.db,
        { playerId, season: row.GROUP_VALUE, statsTimeframe },
        totals,
        { alwaysRefresh: row.GROUP_VALUE === currentSeason },
      );
    }
  }

  private mapDashboardRows(headers: string[], rows: unknown[][]): PlayerDashboardRow[] {
    return rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        mapped[header] = row[index] ?? null;
      });
      return mapped as PlayerDashboardRow;
    });
  }

  private isRetryable(error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return true;
      }
      const message = error.message.toLowerCase();
      if (
        message.includes('nba stats request failed: 5') ||
        message.includes('nba stats request failed: 429')
      ) {
        return true;
      }
      return (
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('econnreset')
      );
    }
    return false;
  }
}
