import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { NbaCdnPlayByPlayClient } from './nba-cdn-playbyplay.client';
import { NbaScheduleClient } from './nba-schedule.client';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';
import { ScheduleSyncService } from './schedule-sync.service';
import { ShotZoneSyncService } from './shot-zone-sync.service';
import { resolveCurrentSeason } from './season';

/**
 * Backfills shot zones for one or more whole seasons.
 *
 * This drives the same per-game sync the worker runs on a cron, so the
 * incremental path and the backfill cannot diverge in how they classify a shot.
 * It exists for the two cases the cron is not meant to cover: seeding seasons
 * that predate the feature, and recomputing every game after a zone boundary
 * moves.
 *
 * A season with no schedule rows has no games to walk, so the schedule is seeded
 * first when it is missing. That is what makes a historical season work: the
 * daily cron only ever maintains the current one.
 *
 * Safe to re-run. Without `SHOT_ZONE_FORCE` it skips games already synced, so a
 * run after an outage only does the missing work; with it, every game is re-read
 * and its tallies replaced under the current rules.
 *
 * Usage (from apps/worker, after `bun run worker:build`):
 *   bun run refresh:shot-zones
 *   SHOT_ZONE_SEASON=2025-26 bun run refresh:shot-zones
 *   SHOT_ZONE_SEASON=2019-20,2020-21,2021-22 bun run refresh:shot-zones
 *   SHOT_ZONE_FORCE=true SHOT_ZONE_CONCURRENCY=10 bun run refresh:shot-zones
 *
 * Runs on Node, not Bun: cdn.nba.com rejects Bun's fetch fingerprint with a 403
 * (curl and Node both get 200), which would fail every game.
 */

@Module({
  providers: [
    DatabaseService,
    RedisService,
    QueueService,
    NbaScheduleClient,
    ScheduleSyncService,
    NbaCdnPlayByPlayClient,
    ShotZoneSyncService,
  ],
})
class RefreshShotZonesModule {}

/** `SHOT_ZONE_SEASON` as a list, newest first; empty means the current season. */
function requestedSeasons(): string[] {
  const raw = process.env.SHOT_ZONE_SEASON?.trim();
  if (!raw) return [resolveCurrentSeason()];
  return raw
    .split(',')
    .map((season) => season.trim())
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
}

async function run() {
  const logger = new Logger('RefreshShotZones');
  const app = await NestFactory.createApplicationContext(RefreshShotZonesModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const sync = app.get(ShotZoneSyncService);
    const scheduleSync = app.get(ScheduleSyncService);
    const force = process.env.SHOT_ZONE_FORCE === 'true';
    const concurrency = Math.max(1, Number(process.env.SHOT_ZONE_CONCURRENCY || '8'));

    let totalFailed = 0;

    for (const season of requestedSeasons()) {
      // The sync walks games from the schedule, so a season whose schedule is
      // missing or half-seeded has nothing (or not enough) to walk. Checked
      // against the feed's own count rather than "any rows at all", because a
      // partially seeded season syncs quietly and covers only what it knows about.
      const coverage = await scheduleSync.ensureScheduleForSeason(season);
      logger.log(
        `season=${season} schedule onFile=${coverage.onFile} expected=${coverage.expected}` +
          `${coverage.seeded ? ' (seeded)' : ''}`,
      );

      // A full season is ~1,400 games; the limit is the whole thing so one run
      // drains the season rather than stopping at the cron's tick-sized cap.
      const summary = await sync.syncPendingGames({
        season,
        limit: Number.MAX_SAFE_INTEGER,
        force,
        concurrency,
      });

      logger.log(
        `refresh done season=${season} games=${summary.games} attempts=${summary.attempts} ` +
          `players=${summary.players} failed=${summary.failed} remaining=${summary.remaining}`,
      );
      totalFailed += summary.failed;
    }

    if (totalFailed > 0) {
      // Games the feed could not serve are left for a re-run rather than reported
      // as success, so a partial backfill is visible to whatever called this.
      logger.warn(`${totalFailed} games failed and were left unsynced`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  new Logger('RefreshShotZones').error('shot-zone refresh failed', error as Error);
  process.exitCode = 1;
});
