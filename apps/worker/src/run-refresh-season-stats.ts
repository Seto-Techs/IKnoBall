import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { and, count, eq, gte, inArray, lt } from 'drizzle-orm';
import { playerSeasonStats, players } from '@iknoball/database';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';
import { QueueService } from './queue.service';
import { PlayerIndexClient } from './player-index.client';
import {
  PlayerSeasonProcessor,
  SeasonTotals,
  upsertSeasonTotals,
} from './processors/player-season.processor';

/**
 * Backfill / repair tool for stale `player_season_stats` rows.
 *
 * Problem it fixes: the whole table can end up as a mid-season snapshot (e.g.
 * every 2025-26 ByYear-regular row synced once on 2026-04-17 with Harden at
 * gp=44 vs the final gp=70), because career crawls were only enqueued for
 * newly-seen players and the processor treated every non-current season as
 * insert-if-missing.
 *
 * Modes:
 *   leagueleaders (default) — ONE leagueleaders request per season type returns
 *     totals for every player who played; bulk-updates all rows for the season.
 *     Wins/losses are not in that payload and are left untouched (the crawl
 *     mode fills them). Use this when stats.nba.com throttles per-player
 *     endpoints — leagueleaders stays reachable much longer.
 *   crawl — staggered per-player career crawls (fills wins/losses and every
 *     season at once). Needs the dashboard endpoints to respond.
 *   purge — drain waiting/delayed jobs from the career queue (stop a retry
 *     storm), then exit.
 *
 * All modes are safe to re-run: finished-season rows only update when the new
 * snapshot has more GP than stored.
 *
 * Usage (from apps/worker):
 *   bun src/run-refresh-season-stats.ts [season] [staleDays] [mode]
 *   bun src/run-refresh-season-stats.ts 2025-26 1 leagueleaders
 *   bun src/run-refresh-season-stats.ts 2025-26 1 crawl
 *   bun src/run-refresh-season-stats.ts "" "" purge
 */

@Module({
  providers: [
    DatabaseService,
    RedisService,
    PlayerIndexClient,
    QueueService,
    PlayerSeasonProcessor,
  ],
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

const SEASON_TYPES = [
  { seasonType: 'Regular Season', statsTimeframe: 'ByYear-regular' },
  { seasonType: 'Playoffs', statsTimeframe: 'ByYear-playoffs' },
] as const;

/** LeagueLeaders row -> SeasonTotals (no wins/losses in that payload). */
function leagueLeadersRowToTotals(
  headers: string[],
  row: unknown[],
): { externalId: string; totals: SeasonTotals } | null {
  const r: Record<string, unknown> = {};
  headers.forEach((h, i) => (r[h] = row[i]));
  const gp = r.GP;
  if (typeof gp !== 'number' || gp <= 0) return null;
  const num = (k: string) => (typeof r[k] === 'number' ? (r[k] as number) : null);
  const ptsTotal = num('PTS');
  const rebTotal = num('REB');
  const astTotal = num('AST');
  const stlTotal = num('STL');
  const blkTotal = num('BLK');
  if ([ptsTotal, rebTotal, astTotal, stlTotal, blkTotal].every((v) => v === null)) {
    return null;
  }
  return {
    externalId: String(r.PLAYER_ID),
    totals: {
      gp,
      fgPct: num('FG_PCT'),
      fg3Pct: num('FG3_PCT'),
      ftPct: num('FT_PCT'),
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
    },
  };
}

async function backfillFromLeagueLeaders(
  database: DatabaseService,
  client: PlayerIndexClient,
  season: string,
) {
  for (const { seasonType, statsTimeframe } of SEASON_TYPES) {
    console.log(`fetching leagueleaders season=${season} seasonType=${seasonType} ...`);
    let response;
    try {
      response = await client.fetchLeagueLeaders(season, seasonType);
    } catch (err) {
      console.error(`leagueleaders fetch failed for ${seasonType}:`, err);
      continue;
    }
    const resultSet = response.resultSets[0];
    if (!resultSet) {
      console.error(`no result set for ${seasonType}`);
      continue;
    }

    const rows: { externalId: string; totals: SeasonTotals }[] = [];
    for (const row of resultSet.rowSet) {
      const mapped = leagueLeadersRowToTotals(resultSet.headers, row);
      if (mapped) rows.push(mapped);
    }
    console.log(`leagueleaders returned ${rows.length} players (${seasonType})`);

    const externalIds = rows.map((r) => r.externalId);
    const idRows = externalIds.length
      ? await database.db
          .select({ id: players.id, externalId: players.externalId })
          .from(players)
          .where(inArray(players.externalId, externalIds))
      : [];
    const idByExternal = new Map(idRows.map((p) => [p.externalId, p.id]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let unknownPlayers = 0;
    for (const { externalId, totals } of rows) {
      const playerId = idByExternal.get(externalId);
      if (!playerId) {
        unknownPlayers += 1;
        continue;
      }
      const outcome = await upsertSeasonTotals(
        database.db,
        { playerId, season, statsTimeframe },
        totals,
        { alwaysRefresh: false },
      );
      if (outcome === 'inserted') inserted += 1;
      else if (outcome === 'updated') updated += 1;
      else skipped += 1;
    }
    console.log(
      `${statsTimeframe}: updated=${updated} inserted=${inserted} skipped(already fresh)=${skipped}` +
        (unknownPlayers ? ` unknownPlayers=${unknownPlayers}` : ''),
    );

    // space out calls to stay under the rate limit
    await sleep(3000);
  }
}

async function backfillFromCrawls(
  database: DatabaseService,
  queue: QueueService,
  season: string,
  staleDays: number,
) {
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

  console.log(`crawl mode: season=${season} staleDays=${staleDays} players=${externalIds.length}`);
  if (externalIds.length === 0) return;

  // stagger enqueues ~500ms apart so the crawl rate stays polite even if a
  // deployed worker starts consuming immediately
  const staggerMs = 500;
  for (const [i, externalId] of externalIds.entries()) {
    await queue.enqueuePlayerCareer(externalId, { delay: i * staggerMs });
  }
  console.log(`enqueued ${externalIds.length} career crawls (stagger ${staggerMs}ms)`);

  // progress = rows actually refreshed in the DB (immune to which worker
  // consumed the job). Small clock-skew margin so DB-server timestamps count.
  const startedBefore = new Date(Date.now() - 60_000);
  const refreshedCount = () =>
    database.db
      .select({ done: count() })
      .from(playerSeasonStats)
      .where(
        and(
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
          gte(playerSeasonStats.updatedAt, startedBefore),
        ),
      );

  let lastDone = -1;
  for (;;) {
    await sleep(5000);
    const [{ done }] = await refreshedCount();
    if (done !== lastDone) {
      const pct = Math.floor((done / externalIds.length) * 100);
      console.log(`synced ${done} of ${externalIds.length} players (${pct}%)`);
      lastDone = done;
    }
    if (done >= externalIds.length) {
      console.log('done: all targeted rows refreshed');
      break;
    }
    const counts = await queue.crawlPlayerCareerJobCounts();
    if (counts.waiting + counts.active + counts.delayed === 0) {
      console.log(
        `queue drained but ${externalIds.length - done} players were not refreshed — ` +
          'crawls failed after retries (check failed jobs / worker logs). Re-run to retry.',
      );
      break;
    }
  }
}

async function run() {
  const args = process.argv.slice(2);
  const mode = (args.find((a) => ['leagueleaders', 'crawl', 'purge'].includes(a)) ||
    'leagueleaders') as 'leagueleaders' | 'crawl' | 'purge';
  const currentSeason = process.env.NBA_CURRENT_SEASON || '';

  if (mode === 'purge') {
    const app = await NestFactory.createApplicationContext(RefreshSeasonStatsModule, {
      logger: ['error', 'warn'],
    });
    await app.get(QueueService).drainPlayerCareerQueue();
    console.log('career queue drained (waiting/delayed jobs removed; failed jobs remain)');
    await app.close();
    return;
  }

  const seasonArg = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  const season = seasonArg || previousSeason(currentSeason);
  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    console.error(`invalid season "${season}" (pass e.g. 2025-26)`);
    process.exit(1);
  }
  const staleDays = Number(args.find((a) => /^\d+$/.test(a)) || '1');

  const app = await NestFactory.createApplicationContext(RefreshSeasonStatsModule, {
    logger: ['error', 'warn'],
  });
  const database = app.get(DatabaseService);
  const queue = app.get(QueueService);
  const client = app.get(PlayerIndexClient);

  console.log(`run-refresh-season-stats mode=${mode} season=${season}`);

  if (mode === 'leagueleaders') {
    await backfillFromLeagueLeaders(database, client, season);
  } else {
    await backfillFromCrawls(database, queue, season, staleDays);
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
