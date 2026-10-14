import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import {
  playerGameShotZones,
  players,
  scheduleDays,
  scheduleGames,
  shotZoneGameSyncs,
} from '@iknoball/database';
import { zoneFor } from '@iknoball/shot-zones';
import { DatabaseService } from './database.service';
import { NbaCdnPlayByPlayClient } from './nba-cdn-playbyplay.client';
import { resolveCurrentSeason } from './season';

export interface ShotZoneSyncSummary {
  /** Games fetched and classified on this run. */
  games: number;
  /** Field-goal attempts those games contributed. */
  attempts: number;
  /** Distinct players those attempts were attributed to. */
  players: number;
  /** Final games still to sync when the run ended. */
  remaining: number;
  /** Games the feed could not be read for; retried on the next run. */
  failed: number;
}

/**
 * The season type a game belongs to, from its id prefix.
 *
 * The schedule tables do not record this and the ids encode it: 001 preseason,
 * 002 regular season, 003 All-Star, 004 playoffs, 005 play-in, 006 All-Star.
 * The All-Star ids return null and are skipped, because the feed's dashboard
 * timeframes have no equivalent and those games are not part of a season.
 */
export function statsTimeframeFor(gameId: string): string | null {
  switch (gameId.slice(0, 3)) {
    case '001':
      return 'ByYear-preseason';
    case '002':
      return 'ByYear-regular';
    case '004':
    case '005':
      return 'ByYear-playoffs';
    default:
      return null;
  }
}

/**
 * Classifies each final game's play-by-play into per-player, per-zone tallies.
 *
 * The unit of work is a game, because that is what the trigger is: a game goes
 * final and its shots become worth recording. A game already in
 * `shot_zone_game_syncs` is skipped, which is what makes the whole thing safe to
 * re-run — a tick that overlaps a backfill, or a retry after a crash, cannot
 * count a game twice.
 *
 * Finding work by "final games with no sync row" rather than by reacting to a
 * live-game event means a game that finished while the worker was down is picked
 * up on the next tick instead of being lost, and a game the feed was not ready
 * for is retried rather than skipped.
 *
 * Node only: cdn.nba.com answers Bun's fetch with a 403 regardless of headers,
 * so this must not be reached from a Bun process. The worker runs on Node.
 */
@Injectable()
export class ShotZoneSyncService {
  private readonly logger = new Logger(ShotZoneSyncService.name);
  private readonly enabled = process.env.SHOT_ZONE_SYNC_ENABLED !== 'false';

  /**
   * Games per run. A night's slate is at most ~15 games, so this is generous for
   * the incremental case while still bounding how long a catch-up run holds the
   * tick — a full season backfill is what `refresh:shot-zones` is for.
   */
  private readonly maxGames = Number(process.env.SHOT_ZONE_SYNC_MAX_GAMES || '60');
  private readonly concurrency = Math.max(1, Number(process.env.SHOT_ZONE_SYNC_CONCURRENCY || '4'));

  /** Single-process guard; the worker runs one instance per deployment. */
  private inFlight = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly playByPlay: NbaCdnPlayByPlayClient,
  ) {}

  @Cron(process.env.SHOT_ZONE_SYNC_CRON || '*/5 * * * *', {
    timeZone: process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York',
  })
  async shotZoneSyncCron() {
    if (!this.enabled) return;
    if (this.inFlight) {
      this.logger.warn('shot-zone sync skipped: previous run still in flight');
      return;
    }

    this.inFlight = true;
    try {
      await this.syncPendingGames();
    } catch (error) {
      this.logger.error('shot-zone sync failed', error as Error);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Syncs up to `limit` final games that have no shot-zone data yet.
   *
   * `force` ignores the sync ledger and re-classifies games already done, which
   * is what a backfill needs after a zone boundary moves: the play-by-play is
   * re-read and the stored tallies are replaced under the new rules.
   */
  async syncPendingGames(
    options: { season?: string; limit?: number; force?: boolean; concurrency?: number } = {},
  ): Promise<ShotZoneSyncSummary> {
    const season = options.season ?? resolveCurrentSeason();
    const limit = options.limit ?? this.maxGames;
    const concurrency = options.concurrency ?? this.concurrency;
    const startedAt = Date.now();

    const games = await this.pendingGames(season, limit, options.force ?? false);
    if (!games.length) {
      this.logger.log(`shot-zone sync season=${season} nothing pending`);
      return { games: 0, attempts: 0, players: 0, remaining: 0, failed: 0 };
    }

    this.logger.log(
      `shot-zone sync season=${season} pending=${games.length}${options.force ? ' force' : ''}`,
    );

    // Player ids are resolved once for the whole run rather than per game: the
    // feed reports ids for players we do not track (two-way and 10-day players
    // the roster sync has not seen), and those shots are dropped rather than
    // failing the insert on a foreign key.
    const playerRows = await this.database.db
      .select({ id: players.id, externalId: players.externalId })
      .from(players);
    const playerIdByExternalId = new Map(playerRows.map((p) => [p.externalId, p.id]));

    const queue = [...games];
    const touchedPlayers = new Set<string>();
    let attempts = 0;
    let failed = 0;
    let processed = 0;

    const workers = Array.from({ length: Math.min(concurrency, games.length) }, async () => {
      while (queue.length) {
        const game = queue.shift();
        if (!game) return;

        try {
          const result = await this.syncGame(game, season, playerIdByExternalId);
          attempts += result.attemptCount;
          for (const externalId of result.playerExternalIds) touchedPlayers.add(externalId);
          processed += 1;
          if (processed % 25 === 0) {
            this.logger.log(`shot-zone sync ${processed}/${games.length} games`);
          }
        } catch (error) {
          // A game the feed cannot serve stays out of the ledger, so the next
          // tick retries it.
          failed += 1;
          this.logger.warn(
            `shot-zone sync failed game=${game.gameId}: ${(error as Error).message}`,
          );
        }
      }
    });

    await Promise.all(workers);

    // What is left after this run, so a catch-up is visible in the logs rather
    // than looking like the sync is keeping up.
    const remaining = (await this.pendingGames(season, Number.MAX_SAFE_INTEGER, false)).length;
    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    this.logger.log(
      `shot-zone sync done season=${season} games=${processed} attempts=${attempts} ` +
        `players=${touchedPlayers.size} failed=${failed} remaining=${remaining} span=${spanSeconds}s`,
    );

    return {
      games: processed,
      attempts,
      players: touchedPlayers.size,
      remaining,
      failed,
    };
  }

  /** Final games in the season with no shot-zone data yet, oldest first. */
  private async pendingGames(season: string, limit: number, force: boolean) {
    const rows = await this.database.db
      .select({ id: scheduleGames.id, gameId: scheduleGames.gameId })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .leftJoin(shotZoneGameSyncs, eq(shotZoneGameSyncs.scheduleGameId, scheduleGames.id))
      .where(
        and(
          eq(scheduleDays.seasonYear, season),
          // 3 is final; a game still in progress has no settled play-by-play.
          gte(scheduleGames.gameStatus, 3),
          force ? undefined : isNull(shotZoneGameSyncs.id),
        ),
      )
      // Oldest first, so a backlog drains in the order the games were played.
      .orderBy(asc(scheduleGames.gameDate))
      .limit(limit);

    return rows;
  }

  /**
   * Reads one game's play-by-play and writes its per-zone tallies.
   *
   * The game's existing rows are replaced rather than merged, inside a
   * transaction, so the stored state always reflects exactly the feed that was
   * just read. Merging would leave a stale non-zero row behind for a zone that
   * no longer receives any attempts after a boundary change.
   */
  private async syncGame(
    game: { id: string; gameId: string },
    season: string,
    playerIdByExternalId: Map<string, string>,
  ): Promise<{ attemptCount: number; playerExternalIds: string[] }> {
    const timeframe = statsTimeframeFor(game.gameId);
    if (!timeframe) {
      // All-Star and any unknown prefix: nothing to store, but it is done, so it
      // must not be picked up again on every tick.
      await this.recordSync(game.id, 0, 0);
      return { attemptCount: 0, playerExternalIds: [] };
    }

    const response = await this.playByPlay.fetchPlayByPlay(game.gameId);

    const tallies = new Map<string, Map<string, { fga: number; fgm: number }>>();
    let attemptCount = 0;

    for (const action of response.game.actions) {
      if (!action.isFieldGoal || action.xLegacy == null || action.yLegacy == null) continue;
      const externalId = String(action.personId);
      if (!playerIdByExternalId.has(externalId)) continue;

      const zoneId = zoneFor(action.xLegacy, action.yLegacy);
      const byZone = tallies.get(externalId) ?? new Map<string, { fga: number; fgm: number }>();
      const tally = byZone.get(zoneId) ?? { fga: 0, fgm: 0 };
      tally.fga += 1;
      if (action.shotResult === 'Made') tally.fgm += 1;
      byZone.set(zoneId, tally);
      tallies.set(externalId, byZone);
      attemptCount += 1;
    }

    const rows = [...tallies].flatMap(([externalId, byZone]) => {
      const playerId = playerIdByExternalId.get(externalId)!;
      // Only zones the player actually shot from. Writing all twelve would be
      // 65% empty rows, and the game's rows are deleted and rewritten anyway, so
      // a zone that has gone quiet simply ends up with no row — the reader
      // zero-fills from the taxonomy, which is where the zone list belongs.
      return [...byZone].map(([zoneId, tally]) => ({
        scheduleGameId: game.id,
        playerId,
        season,
        statsTimeframe: timeframe,
        zoneId,
        fga: tally.fga,
        fgm: tally.fgm,
      }));
    });

    await this.database.db.transaction(async (tx) => {
      await tx.delete(playerGameShotZones).where(eq(playerGameShotZones.scheduleGameId, game.id));
      if (rows.length) {
        await tx.insert(playerGameShotZones).values(rows);
      }
      await tx
        .insert(shotZoneGameSyncs)
        .values({
          scheduleGameId: game.id,
          attemptCount,
          playerCount: tallies.size,
        })
        .onConflictDoUpdate({
          target: shotZoneGameSyncs.scheduleGameId,
          set: { attemptCount, playerCount: tallies.size, updatedAt: new Date() },
        });
    });

    return { attemptCount, playerExternalIds: [...tallies.keys()] };
  }

  /** Marks a game as done without storing anything for it. */
  private async recordSync(scheduleGameId: string, attemptCount: number, playerCount: number) {
    await this.database.db
      .insert(shotZoneGameSyncs)
      .values({ scheduleGameId, attemptCount, playerCount })
      .onConflictDoUpdate({
        target: shotZoneGameSyncs.scheduleGameId,
        set: { attemptCount, playerCount, updatedAt: new Date() },
      });
  }
}
