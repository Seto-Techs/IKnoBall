import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { DayState } from '../scheduler/board';
import type { BoardRepository } from '../scheduler/board-repository';
import { BoardScheduler } from '../scheduler/board-scheduler';
import type { DayKeyGuard } from '../scheduler/day-key.guard';
import type { RecapPoster } from '../scheduler/recap-poster';
import { etDateKey } from '../scheduler/slate-date';
import type { SlatePoster } from '../scheduler/slate-poster';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';

/**
 * One guild's 403 must not cost the other guilds their board.
 *
 * The failure this guards against is the expensive one: a bot in a hundred servers
 * that is missing `Send Messages` in *one* channel. If that 403 escaped the loop,
 * ninety-nine guilds would go a day without their leaderboard because of one
 * server's permissions, and the first symptom would be users noticing — not the logs.
 *
 * The 403 is shaped the way discord.js raises it: a `DiscordAPIError` carries the
 * HTTP status on `status` and Discord's code on `code`.
 */

function forbidden(): Error {
  return Object.assign(new Error('Missing Access'), { status: 403, code: 50001 });
}

function settings(guildId: string): GuildSettings {
  return {
    guildId,
    channelId: `channel-${guildId}`,
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
  };
}

/** Last night's slate, every game final. */
function finishedDay(): DayState {
  return {
    slateKey: '2026-10-26',
    games: 2,
    finals: 2,
    lastTipOff: new Date('2026-10-26T23:30:00.000Z'),
    lastFinalAt: new Date('2026-10-27T02:00:00.000Z'),
  };
}

/** Noon in New York on 27 October 2026, when that board is due. */
const NOON_ET = new Date('2026-10-27T16:00:00.000Z');

function harness(guildIds: string[], failFor: string) {
  const keys = new Set<string>();
  const post = vi.fn(async (target: { guildId: string }) => {
    if (target.guildId === failFor) throw forbidden();
    return 'posted' as const;
  });

  const scheduler = new BoardScheduler(
    { enabled: true } as unknown as DiscordConfigService,
    { listEnabled: async () => guildIds.map(settings) } as unknown as GuildConfigService,
    { daysSince: async () => [finishedDay()] } as unknown as BoardRepository,
    { post } as unknown as RecapPoster,
    {
      hasGames: vi.fn(async () => true),
      nextSlateDay: vi.fn(async (now: Date) => etDateKey(now)),
      postOffDay: vi.fn(async () => {}),
    } as unknown as SlatePoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  return { scheduler, post, keys, boardKeys: boardKeysOf(keys) };
}

/** The board keys only: the off-day note keeps its own keyspace. */
function boardKeysOf(keys: Set<string>): () => string[] {
  return () => [...keys].filter((key) => key.startsWith('recap:')).sort();
}

describe('per-guild isolation', () => {
  it('keeps the other guilds posting when one guild answers 403', async () => {
    const { scheduler, post, boardKeys } = harness(
      ['locked-out', 'guild-b', 'guild-c'],
      'locked-out',
    );

    expect(await scheduler.tick(NOON_ET)).toEqual([
      { guildId: 'locked-out', day: '2026-10-26', status: 'failed' },
      { guildId: 'guild-b', day: '2026-10-26', status: 'posted' },
      { guildId: 'guild-c', day: '2026-10-26', status: 'posted' },
    ]);

    // Every guild after the broken one was still attempted, in order.
    expect(post.mock.calls.map(([target]) => (target as { guildId: string }).guildId)).toEqual([
      'locked-out',
      'guild-b',
      'guild-c',
    ]);
    // …and their boards are on the record, not just attempted.
    expect(boardKeys()).toEqual(['recap:guild-b:2026-10-26', 'recap:guild-c:2026-10-26']);
  });

  it('does not spend the broken guild’s day key, so it retries once the channel is fixed', async () => {
    const { scheduler, keys } = harness(['locked-out', 'guild-b'], 'locked-out');

    await scheduler.tick(NOON_ET);

    // A 403 is a property of the channel, not of the hour: the retry must be allowed.
    expect(keys.has('recap:locked-out:2026-10-26')).toBe(false);
    expect(keys.has('recap:guild-b:2026-10-26')).toBe(true);
  });

  it('isolates a 403 wherever it lands in the sweep, not only at the end', async () => {
    const { scheduler } = harness(['guild-a', 'guild-b', 'locked-out'], 'locked-out');

    expect((await scheduler.tick(NOON_ET)).map((outcome) => outcome.status)).toEqual([
      'posted',
      'posted',
      'failed',
    ]);
  });
});
