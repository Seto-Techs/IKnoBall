import 'reflect-metadata';
import 'dotenv/config';
import { createDatabase, playerTeamSeasons, players } from '@iknoball/database';
import { inArray } from 'drizzle-orm';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HISTORICAL_SOURCE_URL, readHistoricalTeamSeasons } from './historical-team-seasons';

const execFileAsync = promisify(execFile);
const SOURCE_ARCHIVE = '/tmp/iknoball-nba-history.zip';
const SOURCE_DIR = '/tmp/iknoball-nba-history';
const SOURCE_CSV = `${SOURCE_DIR}/NBA_PLAYER_DATASET.csv`;
const CHUNK_SIZE = 500;

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function sourceCsvPath() {
  const supplied = argument('file');
  if (supplied) return supplied;

  await mkdir(SOURCE_DIR, { recursive: true });
  const response = await fetch(HISTORICAL_SOURCE_URL);
  if (!response.ok) throw new Error(`Historical source download failed: HTTP ${response.status}`);
  await writeFile(SOURCE_ARCHIVE, Buffer.from(await response.arrayBuffer()));
  await rm(SOURCE_DIR, { recursive: true, force: true });
  await mkdir(SOURCE_DIR, { recursive: true });
  await execFileAsync('unzip', ['-oq', SOURCE_ARCHIVE, '-d', SOURCE_DIR]);
  return SOURCE_CSV;
}

async function main() {
  const csvPath = await sourceCsvPath();
  const sourceRows = await readHistoricalTeamSeasons(csvPath);
  const database = createDatabase();

  try {
    const localPlayers = await database.db
      .select({ id: players.id, externalId: players.externalId })
      .from(players)
      .where(inArray(players.externalId, [...new Set(sourceRows.map((row) => row.externalId))]));
    const playerIds = new Map(localPlayers.map((player) => [player.externalId, player.id]));
    const historicalRows = sourceRows.flatMap((row) => {
      const playerId = playerIds.get(row.externalId);
      return playerId
        ? [{ playerId, season: row.season, seasonType: 'ByYear-regular', teamAbbr: row.teamAbbr }]
        : [];
    });

    // Backfill the source's historical seasons without overwriting newer rows
    // written by the NBA career feed. This source currently ends at 2023-24.
    for (let offset = 0; offset < historicalRows.length; offset += CHUNK_SIZE) {
      await database.db
        .insert(playerTeamSeasons)
        .values(historicalRows.slice(offset, offset + CHUNK_SIZE))
        .onConflictDoNothing();
    }

    // Current seasons are deliberately refreshed from career data, not this
    // snapshot. Count historical duplicates separately from DB-native entries.
    console.log(
      `historical team seasons imported source=${sourceRows.length} matched=${historicalRows.length} skipped=${sourceRows.length - historicalRows.length}`,
    );
  } finally {
    await database.pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
