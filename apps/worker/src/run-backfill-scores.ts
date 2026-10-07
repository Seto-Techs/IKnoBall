import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from './database.service';

/**
 * Backfill / repair tool for `schedule_games` scores that never arrived.
 *
 * Problem it fixes: `homeTeamScore`/`awayTeamScore` were written only by the
 * daily schedule sync, which reconciles today alone. A game that tips late on
 * day D and ends after midnight is marked final on D+1 — by which point the sync
 * has moved on and will never revisit D — so the 0-0 placeholder the feed writes
 * for a game that has not been played stayed in the row permanently. Prediction
 * settlement reads those columns, so its picks sat `pending` forever, and
 * completed games rendered 0-0 on the game and team screens.
 *
 * `syncGameBoxscore` now writes the score it already fetches, so this script
 * only has to repair rows that were broken before that change.
 *
 * Modes:
 *   report — list the affected games and how many are repairable; change nothing.
 *   summary (default) — repair every final game whose score is missing or 0-0
 *     from the boxscore summary already stored for it. Pure SQL, no network.
 *
 * Anything `summary` cannot repair has no usable boxscore summary either, so it
 * needs a real re-fetch: run `bun run sync:boxscore` afterwards. The script
 * reports that count.
 *
 * Safe to re-run: only rows whose score is still missing or 0-0 are touched, and
 * only when the stored summary holds a real score.
 *
 * Usage (from apps/worker):
 *   bun src/run-backfill-scores.ts            # summary
 *   bun src/run-backfill-scores.ts report
 */

@Module({ providers: [DatabaseService] })
class BackfillScoresModule {}

type Mode = 'report' | 'summary';

/** Final games whose stored score is missing or still the 0-0 placeholder. */
const BROKEN_GAMES = sql`
  select g.id,
         g."gameId",
         g."gameDate",
         g."homeTeamTricode" as home,
         g."awayTeamTricode" as away,
         g."homeTeamScore" as home_score,
         g."awayTeamScore" as away_score,
         s."homeScore" as summary_home,
         s."awayScore" as summary_away
  from schedule_games g
  left join schedule_boxscore_summaries s on s."scheduleGameId" = g.id
  where g."gameStatus" = 3
    and (
      g."homeTeamScore" is null
      or g."awayTeamScore" is null
      or g."homeTeamScore" + g."awayTeamScore" = 0
    )
  order by g."gameDate"
`;

const REPAIR = sql`
  update schedule_games g
  set "homeTeamScore" = s."homeScore",
      "awayTeamScore" = s."awayScore"
  from schedule_boxscore_summaries s
  where s."scheduleGameId" = g.id
    and g."gameStatus" = 3
    and (
      g."homeTeamScore" is null
      or g."awayTeamScore" is null
      or g."homeTeamScore" + g."awayTeamScore" = 0
    )
    and s."homeScore" is not null
    and s."awayScore" is not null
    and s."homeScore" + s."awayScore" > 0
`;

async function run() {
  const logger = new Logger('BackfillScores');
  const mode = (process.argv[2] as Mode | undefined) ?? 'summary';

  if (mode !== 'report' && mode !== 'summary') {
    logger.error(`unknown mode '${mode}' (expected 'report' or 'summary')`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(BackfillScoresModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const { db } = app.get(DatabaseService);
    const broken = await db.execute(BROKEN_GAMES);
    const rows = broken.rows as Array<Record<string, unknown>>;

    const repairable = rows.filter(
      (row) =>
        row.summary_home !== null &&
        row.summary_away !== null &&
        Number(row.summary_home) + Number(row.summary_away) > 0,
    );

    logger.log(`final games with a missing or 0-0 score: ${rows.length}`);
    logger.log(`repairable from a stored boxscore summary: ${repairable.length}`);
    logger.log(`need a re-fetch (no usable summary): ${rows.length - repairable.length}`);

    for (const row of rows) {
      const summary =
        row.summary_home === null ? 'no summary' : `${row.summary_home}-${row.summary_away}`;
      logger.log(
        `${row.gameId} ${row.gameDate} ${row.away}@${row.home} stored=${row.home_score}-${row.away_score} summary=${summary}`,
      );
    }

    if (mode === 'report') {
      logger.log('report mode: no rows changed');
      return;
    }

    if (!repairable.length) {
      logger.log('nothing to repair');
      return;
    }

    const repaired = await db.execute(REPAIR);
    logger.log(`repaired ${repaired.rowCount ?? 0} game(s) from stored summaries`);

    if (rows.length - repairable.length > 0) {
      logger.warn(
        `${rows.length - repairable.length} game(s) still have no score; run \`bun run sync:boxscore\` to re-fetch them`,
      );
    }
  } finally {
    await app.close();
  }
}

run();
