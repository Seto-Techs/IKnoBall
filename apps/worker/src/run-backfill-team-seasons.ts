import 'reflect-metadata';
import 'dotenv/config';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { players } from '@iknoball/database';
import { DatabaseService } from './database.service';
import { PlayerIndexClient } from './player-index.client';
import { PlayerSeasonProcessor } from './processors/player-season.processor';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';

@Module({
  providers: [
    DatabaseService,
    RedisService,
    QueueService,
    PlayerIndexClient,
    PlayerSeasonProcessor,
  ],
})
class BackfillTeamSeasonsModule {}

function requestedPlayers(argv: string[]) {
  const value = argv.find((arg) => arg.startsWith('--players='))?.slice('--players='.length);
  return (
    value
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? null
  );
}

/**
 * Hydrate the complete graph source from the career dashboard.
 *
 * Usage:
 *   bun run backfill:team-seasons                  # every player in players
 *   bun run backfill:team-seasons --players=2544,203500
 *
 * This is intentionally separate from box-score crawling: the career feed owns
 * historical team memberships, including single-team seasons.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(BackfillTeamSeasonsModule, {
    logger: ['log', 'error', 'warn'],
  });
  const logger = new Logger('BackfillTeamSeasons');

  try {
    const database = app.get(DatabaseService);
    const processor = app.get(PlayerSeasonProcessor);
    const requested = requestedPlayers(process.argv.slice(2));
    const rows = requested
      ? requested.map((externalId) => ({ externalId }))
      : await database.db.select({ externalId: players.externalId }).from(players);

    logger.log(`backfill start players=${rows.length}`);
    let done = 0;
    for (const row of rows) {
      try {
        await processor.syncPlayerCareerNow(row.externalId);
        done += 1;
        logger.log(`backfilled ${done}/${rows.length} player=${row.externalId}`);
      } catch (error) {
        logger.error(`backfill failed player=${row.externalId}`, error as Error);
      }
    }
    logger.log(`backfill done succeeded=${done} failed=${rows.length - done}`);
  } finally {
    await app.close();
  }
}

void main();
