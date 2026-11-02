import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { Infrastructure } from './infrastructure';
import { RolloverRepository } from './rollover-repository';
import { etDateKey } from './slate-date';

/**
 * What the rollover asks Postgres, read back from the statements it compiles.
 *
 * Both failures worth a test here are silent:
 *
 * - **The join column.** `discord_cards.gameId` and `prediction_picks.gameId` hold
 *   the feed's game id (`0022600123`). `schedule_games` has that column *and* an
 *   unrelated UUID `id`, so joining on `id` is valid SQL that matches no row. No
 *   guild then reads as ever-posted, nothing rolls over, and every recap counts
 *   zero picks.
 * - **Which days count as postable.** Offering a day whose games have all tipped
 *   off compiles to an empty slate, which the rollover deliberately retries rather
 *   than records — so a guild that fell behind asks for that same dead day every
 *   minute and never advances.
 *
 * A fake repository cannot see either, and the decision layer (`rollover.ts`)
 * never touches SQL, so this compiles the real queries through a recording client.
 */
function recordingDb(rowsFor: (sql: string) => unknown[] = () => []) {
  const statements: { text: string; values: unknown[] }[] = [];

  const client = {
    // `pg` is called as `query(text, params)`; drizzle passes the bound values as
    // the second argument, not inside the query config.
    query: async (query: unknown, params: unknown[] = []) => {
      const text = typeof query === 'string' ? query : (query as { text: string }).text;
      statements.push({ text, values: params });
      return { rows: rowsFor(text), fields: [] };
    },
  };

  return { db: drizzle(client as never), statements };
}

/** Whitespace in a compiled statement is drizzle's formatting, not the assertion. */
function singleLine(sql: string): string {
  return sql.replace(/\s+/g, ' ');
}

/**
 * One guild that was last posted a while ago, so the queries after the first run.
 *
 * Rows come back positionally — drizzle asks `pg` for arrays and maps them onto the
 * select itself — so this is `[guildId, lastPostedKey]`, in that order.
 */
const onePostedGuild = (sql: string) =>
  sql.includes('"discord_cards"') ? [['guild-1', '2026-10-29']] : [];

describe('RolloverRepository joins', () => {
  it('finds a guild’s last posted day through the feed game id, not the row id', async () => {
    const { db, statements } = recordingDb();
    const repo = new RolloverRepository({ db } as unknown as Infrastructure);

    await repo.statesForAllGuilds(new Date('2026-11-01T06:40:00.000Z'));

    expect(statements).toHaveLength(1);
    const sql = singleLine(statements[0]?.text ?? '');
    expect(sql).toContain('"schedule_games"."gameId" = "discord_cards"."gameId"');
    expect(sql).not.toContain('"schedule_games"."id"');
  });

  it('counts settled picks through the feed game id, not the row id', async () => {
    const { db, statements } = recordingDb();
    const repo = new RolloverRepository({ db } as unknown as Infrastructure);

    await repo.settledPickCount('guild-1', '2026-10-31');

    expect(statements).toHaveLength(1);
    const sql = singleLine(statements[0]?.text ?? '');
    expect(sql).toContain('"schedule_games"."gameId" = "prediction_picks"."gameId"');
    expect(sql).not.toContain('"schedule_games"."id"');
  });
});

describe('RolloverRepository postable days', () => {
  it('offers only days from today on that still have a game to pick', async () => {
    const now = new Date('2026-11-01T06:40:00.000Z');
    const { db, statements } = recordingDb(onePostedGuild);
    const repo = new RolloverRepository({ db } as unknown as Infrastructure);

    const states = await repo.statesForAllGuilds(now);

    expect(states).toEqual([
      { guildId: 'guild-1', lastPostedKey: '2026-10-29', dayOver: true, nextKey: null },
    ]);

    const postable = statements.find((statement) =>
      singleLine(statement.text).includes('select distinct'),
    );
    expect(postable).toBeDefined();
    const sql = singleLine(postable?.text ?? '');
    expect(sql).toContain('"schedule_games"."gameStatus" = $');
    expect(sql).toContain('"schedule_games"."gameDateTimeUTC" > $');

    // Today, never yesterday: a finished day posts nothing, and retrying one is what
    // wedged a guild that had fallen behind. Then the scheduled-only filter, then the
    // tip-off cut-off, then the row cap.
    expect(postable?.values[0]).toBe(etDateKey(now));
    expect(postable?.values[1]).toBe(1);
    expect(new Date(postable?.values[2] as Date).getTime()).toBe(now.getTime());
  });
});
