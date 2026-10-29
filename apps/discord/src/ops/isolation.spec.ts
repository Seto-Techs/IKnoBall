import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { DayKeyGuard } from '../scheduler/day-key.guard';
import type { PostResult, SlatePoster } from '../scheduler/slate-poster';
import { SlateScheduler } from '../scheduler/slate-scheduler';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';

/**
 * One guild's 403 must not cost the other guilds their slate.
 *
 * The failure this guards against is the expensive one: a bot in a hundred servers
 * that is missing `Send Messages` in *one* channel. If that 403 escaped the loop,
 * ninety-nine guilds would go dark because of one server's permissions, and the
 * first symptom would be users noticing — not the logs.
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
    postHour: 9,
    timezone: 'America/New_York',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
  };
}

function posted(guildId: string): PostResult {
  return {
    status: 'posted',
    etKey: '2026-10-27',
    games: 2,
    messageIds: [`message-${guildId}`],
    threadId: null,
  };
}

/** 9 a.m. in New York on 27 October 2026. */
const NINE_ET = new Date('2026-10-27T13:00:00.000Z');

function harness(guildIds: string[], failFor: string) {
  const keys = new Set<string>();
  const post = vi.fn(async (target: { guildId: string }) => {
    if (target.guildId === failFor) throw forbidden();
    return posted(target.guildId);
  });

  const scheduler = new SlateScheduler(
    { enabled: true } as unknown as DiscordConfigService,
    { listEnabled: async () => guildIds.map(settings) } as unknown as GuildConfigService,
    { post } as unknown as SlatePoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  return { scheduler, post, keys };
}

describe('per-guild isolation', () => {
  it('keeps the other guilds posting when one guild answers 403', async () => {
    const { scheduler, post, keys } = harness(['locked-out', 'guild-b', 'guild-c'], 'locked-out');

    expect(await scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'locked-out', status: 'failed' },
      { guildId: 'guild-b', status: 'posted' },
      { guildId: 'guild-c', status: 'posted' },
    ]);

    // Every guild after the broken one was still attempted, in order.
    expect(post.mock.calls.map(([target]) => target.guildId)).toEqual([
      'locked-out',
      'guild-b',
      'guild-c',
    ]);
    // …and their slates are on the record, not just attempted.
    expect(keys).toEqual(new Set(['guild-b:2026-10-27', 'guild-c:2026-10-27']));
  });

  it('does not spend the broken guild’s day key, so it retries once the channel is fixed', async () => {
    const { scheduler, keys } = harness(['locked-out', 'guild-b'], 'locked-out');

    await scheduler.tick(NINE_ET);

    // A 403 is a property of the channel, not of the hour: the retry must be allowed.
    expect(keys.has('locked-out:2026-10-27')).toBe(false);
    expect(keys.has('guild-b:2026-10-27')).toBe(true);
  });

  it('isolates a 403 wherever it lands in the sweep, not only at the end', async () => {
    const { scheduler } = harness(['guild-a', 'guild-b', 'locked-out'], 'locked-out');

    expect((await scheduler.tick(NINE_ET)).map((outcome) => outcome.status)).toEqual([
      'posted',
      'posted',
      'failed',
    ]);
  });
});
