import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { playerSeasonStats, players } from '@iknoball/database';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';
import { QueueService } from './queue.service';
import { PlayerIndexClient } from './player-index.client';
import { PlayerSeasonProcessor } from './processors/player-season.processor';

/**
 * Backfill / repair tool for stale `player_season_stats` rows.
 *
 * Problem it fixes: the whole table can end up as a mid-season snapshot (e.g.
 * every 2025-26 ByYear-regular row synced once on 2026-04-17 with Harden at
 * gp=44 vs the final gp=70), because career crawls were only enqueued for
 * newly-seen players and the processor treated every non-current season as
 * insert-if-missing.
 *
 * What it does: finds every player whose row for the target season is stale
 * (updatedAt older than --stale-days) and enqueues a career crawl for each,
 * staggered to stay under NBA's rate limits. This process also runs the
 * PlayerSeasonProcessor worker, so it drains its own queue; if a deployed
 * worker shares the same redis, jobs are distributed between them.
 *
 * Safe to re-run: already-repaired rows have a fresh updatedAt and are skipped;
 * crawl jobIds dedupe against pending jobs; the processor only updates a
 * finished-season row when the crawled snapshot has more GP than stored.
 *
 * Usage (from apps/worker):
 *   bun src/run-refresh-season-stats.ts [season] [staleDays]
 *   bun src/run-refresh-season-stats.ts            # previous season, 1 day
 *   bun src/run-refresh-season-stats.ts 2025-26 1
 */

@Module({
  providers: [DatabaseService, RedisService, PlayerIndexClient, QueueService, PlayerSeasonProcessor],
})
class RefreshSeasonStatsModule {}

function previousSeason(season: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return '';
  const first = parseInt(m[1], 10);
  const prevSecond = String(first).slice(-2).padStart(2, '0');
  return `${first - 1}-${prevSecond}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const currentSeason = process.env.NBA_CURRENT_SEASON || '';
  const season = process.argv[2] || previousSeason(currentSeason);
  const staleDays = Number(process.argv[3] || '1');
  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    console.error(`invalid season "${season}" (pass e.g. 2025-26)`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(RefreshSeasonStatsModule, {
    logger: ['error', 'warn'],
  });
  const database = app.get(DatabaseService);
  const queue = app.get(QueueService);

  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const staleRows = await database.db
    .select({ externalId: players.externalId })
    .from(playerSeasonStats)
    .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(
      and(
        eq(playerSeasonStats.season, season),
        eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
        lt(playerSeasonStats.updatedAt, cutoff),
      ),
    );
  const externalIds = Array.from(new Set(staleRows.map((r) => r.externalId)));

  console.log(
    `run-refresh-season-stats season=${season} staleDays=${staleDays} players=${externalIds.length}`,
  );
  if (externalIds.length === 0) {
    await app.close();
    return;
  }

  // stagger enqueues ~500ms apart so the crawl rate stays polite even if a
  // deployed worker starts consuming immediately
  const staggerMs = 500;
  for (const [i, externalId] of externalIds.entries()) {
    await queue.enqueuePlayerCareer(externalId, { delay: i * staggerMs });
  }
  console.log(`enqueued ${externalIds.length} career crawls (stagger ${staggerMs}ms)`);

  // drain: wait until nothing is waiting/active/delayed, then report
  for (;;) {
    await sleep(5000);
    const counts = await queue.crawlPlayerCareerJobCounts();
    const pending = counts.waiting + counts.active + counts.delayed;
    if (pending === 0) {
      console.log(
        `drained: completed=${counts.completed} failed=${counts.failed} ` +
          `(this run also completed ${counts.completed} if no deployed worker is sharing the queue)`,
      );
      break;
    }
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
