import 'reflect-metadata';
import 'dotenv/config';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, sql } from 'drizzle-orm';
import { playerSeasonStats, players, scheduleDays, scheduleGames, teams } from '@iknoball/database';
import { DatabaseService } from './database.service';
import { NbaScheduleClient } from './nba-schedule.client';
import { PlayerIndexClient } from './player-index.client';
import { PlayerSyncService } from './player-sync.service';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';
import { ScheduleSyncService } from './schedule-sync.service';
import { TeamSeedService } from './team-seed.service';
import { resolveCurrentSeason } from './season';

/**
 * Readies a fresh database for production: teams, players, and the schedule.
 *
 * Everything here is the reference data the rest of the app assumes exists — a
 * team grid with no teams, a leaderboard with no players, a dashboard with no
 * games. Each step is idempotent, so running this against an environment that is
 * already seeded is a no-op that reports coverage rather than a second copy.
 *
 * The player step enqueues one career crawl per player, which is what fills
 * `player_season_stats`; the worker drains that queue, so those rows appear once
 * it is running rather than when this script exits.
 *
 * Usage (from apps/worker, after `bun run worker:build`):
 *   node dist/run-bootstrap.js
 *   node dist/run-bootstrap.js --seasons=2025-26,2026-27
 *   node dist/run-bootstrap.js --skip-players --skip-schedule
 */

@Module({
  providers: [
    DatabaseService,
    RedisService,
    QueueService,
    TeamSeedService,
    PlayerIndexClient,
    PlayerSyncService,
    NbaScheduleClient,
    ScheduleSyncService,
  ],
})
class BootstrapModule {}

interface BootstrapOptions {
  seasons: string[];
  skipPlayers: boolean;
  skipSchedule: boolean;
}

function parseArgs(argv: string[]): BootstrapOptions {
  const seasonsArg = argv.find((arg) => arg.startsWith('--seasons='));
  const requested = seasonsArg
    ?.slice('--seasons='.length)
    .split(',')
    .map((season) => season.trim())
    .filter(Boolean);

  return {
    seasons: requested?.length ? requested : [resolveCurrentSeason()],
    skipPlayers: argv.includes('--skip-players'),
    skipSchedule: argv.includes('--skip-schedule'),
  };
}

interface SeasonCoverage {
  season: string;
  days: number;
  games: number;
  expected: number | null;
}

async function countSeason(db: DatabaseService['db'], season: string) {
  const [row] = await db
    .select({
      days: sql<number>`count(distinct ${scheduleDays.id})::int`,
      games: sql<number>`count(${scheduleGames.id})::int`,
    })
    .from(scheduleDays)
    .leftJoin(scheduleGames, eq(scheduleGames.scheduleDayId, scheduleDays.id))
    .where(eq(scheduleDays.seasonYear, season));

  return { days: Number(row?.days ?? 0), games: Number(row?.games ?? 0) };
}

async function main() {
  const logger = new Logger('Bootstrap');
  const options = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const database = app.get(DatabaseService);
    const teamSeed = app.get(TeamSeedService);
    const playerSync = app.get(PlayerSyncService);
    const scheduleSync = app.get(ScheduleSyncService);

    logger.log(`bootstrap start seasons=${options.seasons.join(',')}`);

    await teamSeed.seed();

    if (options.skipPlayers) {
      logger.warn('bootstrap skipping player sync (--skip-players)');
    } else {
      await playerSync.syncPlayers(resolveCurrentSeason());
      logger.log('bootstrap player sync enqueued career crawls; the worker drains them');
    }

    const coverage: SeasonCoverage[] = [];
    for (const season of options.seasons) {
      let expected: number | null = null;
      if (!options.skipSchedule) {
        const ensured = await scheduleSync.ensureScheduleForSeason(season);
        expected = ensured.expected;
      }
      const counted = await countSeason(database.db, season);
      coverage.push({ season, ...counted, expected });
    }

    const [teamCountRow] = await database.db
      .select({ total: sql<number>`count(*)::int` })
      .from(teams);
    const [playerCountRow] = await database.db
      .select({ total: sql<number>`count(*)::int` })
      .from(players);
    const [statCountRow] = await database.db
      .select({ total: sql<number>`count(*)::int` })
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.season, resolveCurrentSeason()));

    const teamCount = Number(teamCountRow?.total ?? 0);
    const playerCount = Number(playerCountRow?.total ?? 0);
    const statCount = Number(statCountRow?.total ?? 0);

    logger.log('bootstrap report');
    logger.log(`  teams: ${teamCount}`);
    logger.log(`  players: ${playerCount}`);
    logger.log(`  ${resolveCurrentSeason()} player_season_stats rows: ${statCount}`);
    for (const season of coverage) {
      const expected = season.expected === null ? 'not checked' : season.expected;
      logger.log(
        `  ${season.season}: ${season.days} days, ${season.games} games (feed lists ${expected})`,
      );
    }

    const incomplete =
      teamCount < 30 ||
      coverage.some((season) => season.expected !== null && season.games < season.expected);

    if (incomplete) {
      logger.error('bootstrap finished with missing reference data; see the report above');
      process.exitCode = 1;
    } else {
      logger.log('bootstrap done');
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof Error) {
    logger.error(`bootstrap failed: ${error.name}: ${error.message}`, error.stack);
  } else {
    logger.error(`bootstrap failed: ${String(error)}`);
  }
  process.exitCode = 1;
});
