import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { Infrastructure } from './infrastructure';
import { RolloverRepository } from './rollover-repository';

/**
 * The join column both rollover queries depend on.
 *
 * `discord_cards.gameId` and `prediction_picks.gameId` hold the feed's game id
 * (`0022600123`). `schedule_games` has that column *and* an unrelated UUID `id`,
 * so joining on `id` is valid SQL that matches no row — it fails silently. The
 * failure mode is the worst one available: no guild reads as ever-posted, so
 * `statesForAllGuilds` answers "nobody", nothing rolls over, and every recap
 * counts zero picks. A fake repository cannot see it and the decision layer
 * (`rollover.ts`) never touches SQL, so this compiles the real queries through a
 * recording client and reads the statement.
 */
function recordingDb() {
  const statements: string[] = [];

  const client = {
    query: async (query: unknown) => {
      statements.push(typeof query === 'string' ? query : (query as { text: string }).text);
      return { rows: [], fields: [] };
    },
  };

  return { db: drizzle(client as never), statements };
}

/** Whitespace in a compiled statement is drizzle's formatting, not the assertion. */
function singleLine(sql: string): string {
  return sql.replace(/\s+/g, ' ');
}

describe('RolloverRepository joins', () => {
  it('finds a guild’s last posted day through the feed game id, not the row id', async () => {
    const { db, statements } = recordingDb();
    const repo = new RolloverRepository({ db } as unknown as Infrastructure);

    await repo.statesForAllGuilds(new Date('2026-11-01T06:40:00.000Z'));

    expect(statements).toHaveLength(1);
    const sql = singleLine(statements[0] ?? '');
    expect(sql).toContain('"schedule_games"."gameId" = "discord_cards"."gameId"');
    expect(sql).not.toContain('"schedule_games"."id"');
  });

  it('counts settled picks through the feed game id, not the row id', async () => {
    const { db, statements } = recordingDb();
    const repo = new RolloverRepository({ db } as unknown as Infrastructure);

    await repo.settledPickCount('guild-1', '2026-10-31');

    expect(statements).toHaveLength(1);
    const sql = singleLine(statements[0] ?? '');
    expect(sql).toContain('"schedule_games"."gameId" = "prediction_picks"."gameId"');
    expect(sql).not.toContain('"schedule_games"."id"');
  });
});
