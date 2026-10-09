import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import { scheduleBoxscorePlayers, scheduleGames } from '@iknoball/database';
import { DatabaseService } from './database.service';
import { NbaCdnBoxScoreClient } from './nba-cdn-boxscore.client';

/**
 * Backfill for `schedule_boxscore_players.starter` / `displayOrder`.
 *
 * Both columns were added after the crawler had already stored box scores, and
 * they cannot be derived from what is persisted: the feed's player array order
 * does not reliably place the starting five first (checked against the live CDN
 * feed — 4 of 16 sides disagreed). So this re-reads the source of truth.
 *
 * It only writes those two columns; it does not touch the stat columns. One
 * batched UPDATE per game, `STARTER_BACKFILL_CONCURRENCY` games in flight.
 *
 * Safe to re-run: only rows whose `starter` is still null are considered, so a
 * game already backfilled is skipped entirely.
 *
 * Usage (from apps/worker, after `bun run worker:build`):
 *   bun run backfill:starters
 *   STARTER_BACKFILL_CONCURRENCY=8 bun run backfill:starters
 *
 * Runs on Node, not Bun: cdn.nba.com rejects Bun's fetch fingerprint with a
 * 403 (curl and Node both get 200), which fails every game in the backfill.
 */

@Module({ providers: [DatabaseService, NbaCdnBoxScoreClient] })
class BackfillStartersModule {}

const CONCURRENCY = Math.max(1, Number(process.env.STARTER_BACKFILL_CONCURRENCY || '6'));

async function run() {
  const logger = new Logger('BackfillStarters');
  const app = await NestFactory.createApplicationContext(BackfillStartersModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const database = app.get(DatabaseService);
    const cdn = app.get(NbaCdnBoxScoreClient);

    const targets = await database.db
      .selectDistinct({
        scheduleGameId: scheduleBoxscorePlayers.scheduleGameId,
        gameId: scheduleGames.gameId,
      })
      .from(scheduleBoxscorePlayers)
      .innerJoin(scheduleGames, eq(scheduleGames.id, scheduleBoxscorePlayers.scheduleGameId))
      .where(isNull(scheduleBoxscorePlayers.starter));

    logger.log(`games needing a starter backfill: ${targets.length}`);
    if (!targets.length) {
      return;
    }

    const queue = [...targets];
    let done = 0;
    let failed = 0;

    const worker = async () => {
      for (;;) {
        const target = queue.shift();
        if (!target) return;

        try {
          const response = await cdn.fetchLiveBoxScore(target.gameId);
          const players = [...response.game.homeTeam.players, ...response.game.awayTeam.players];

          if (!players.length) {
            failed += 1;
            continue;
          }

          // One statement per game: VALUES join keyed on the NBA person id.
          const params: unknown[] = [target.scheduleGameId];
          const tuples = players.map((p) => {
            const base = params.length;
            params.push(String(p.personId), p.starter === '1', p.order ?? null);
            return `($${base + 1}::text, $${base + 2}::boolean, $${base + 3}::int)`;
          });

          await database.client.pool.query(
            `update schedule_boxscore_players p
                set starter = v.starter, "displayOrder" = v."displayOrder"
               from (values ${tuples.join(', ')})
                 as v("playerExternalId", starter, "displayOrder")
              where p."scheduleGameId" = $1
                and p."playerExternalId" = v."playerExternalId"`,
            params,
          );
        } catch (error) {
          failed += 1;
          logger.warn(`backfill failed game=${target.gameId}: ${(error as Error).message}`);
        }

        done += 1;
        if (done % 100 === 0 || done === targets.length) {
          logger.log(`backfilled ${done}/${targets.length} games (failed=${failed})`);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    logger.log(`done: games=${done} failed=${failed}`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
