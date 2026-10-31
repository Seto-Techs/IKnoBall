import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayKeyGuard } from './day-key.guard';
import type { PostResult, SlatePoster } from './slate-poster';
import { SlateScheduler } from './slate-scheduler';

/**
 * The minute cron: does it know when it is a guild's hour, and does it post once?
 *
 * The clock is an argument, so every case here is an exact instant. Nothing is
 * mocked beyond the four collaborators: a fake gateway is not needed, because the
 * scheduler never touches Discord — it asks `SlatePoster`.
 */

function settings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    postHour: 9,
    timezone: 'America/New_York',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
    ...overrides,
  };
}

function posted(overrides: Partial<PostResult> = {}): PostResult {
  return {
    status: 'posted',
    etKey: '2026-10-27',
    games: 2,
    messageIds: ['message-1'],
    ...overrides,
  };
}

interface Harness {
  scheduler: SlateScheduler;
  post: ReturnType<typeof vi.fn>;
  listEnabled: ReturnType<typeof vi.fn>;
  keys: Set<string>;
}

function harness(
  guildList: GuildSettings[],
  options: {
    enabled?: boolean;
    result?: PostResult | (() => Promise<PostResult>);
  } = {},
): Harness {
  const keys = new Set<string>();
  const post = vi.fn(async () => {
    const result = options.result ?? posted();
    return typeof result === 'function' ? await result() : result;
  });
  const listEnabled = vi.fn(async () => guildList);

  const scheduler = new SlateScheduler(
    { enabled: options.enabled ?? true } as unknown as DiscordConfigService,
    { listEnabled } as unknown as GuildConfigService,
    { post } as unknown as SlatePoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  return { scheduler, post, listEnabled, keys };
}

/** 9 a.m. in New York on 27 October 2026. */
const NINE_ET = new Date('2026-10-27T13:00:00.000Z');

describe('the local hour', () => {
  it('posts when the guild’s own clock reaches its hour', async () => {
    const { scheduler, post, keys } = harness([settings()]);

    expect(await scheduler.tick(NINE_ET)).toEqual([{ guildId: 'guild-1', status: 'posted' }]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ guildId: 'guild-1', channelId: 'channel-1' }, NINE_ET);
    expect([...keys]).toEqual(['guild-1:2026-10-27']);
  });

  it('says nothing when the hour has already passed today', async () => {
    // 15:00 UTC is 11 a.m. in New York: 9 a.m. came and went.
    const { scheduler, post } = harness([settings({ postHour: 9 })]);

    expect(await scheduler.tick(new Date('2026-10-27T15:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'not-due' },
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it('says nothing when the guild’s hour is still tomorrow', async () => {
    // 13:00 UTC is midnight on the 28th in Sydney; its 9 a.m. is 22:00 UTC.
    const { scheduler, post } = harness([settings({ timezone: 'Australia/Sydney', postHour: 9 })]);

    expect(await scheduler.tick(NINE_ET)).toEqual([{ guildId: 'guild-1', status: 'not-due' }]);
    expect(post).not.toHaveBeenCalled();

    expect(await scheduler.tick(new Date('2026-10-27T22:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'posted' },
    ]);
  });

  it('gives two guilds their own hours at the same instant', async () => {
    const { scheduler, post } = harness([
      settings({ guildId: 'london', timezone: 'Europe/London', postHour: 13 }),
      settings({ guildId: 'new-york', timezone: 'America/New_York', postHour: 9 }),
      settings({ guildId: 'sydney', timezone: 'Australia/Sydney', postHour: 9 }),
    ]);

    // 13:00 UTC: 9 a.m. New York, 1 p.m. London, midnight Sydney.
    expect(await scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'london', status: 'posted' },
      { guildId: 'new-york', status: 'posted' },
      { guildId: 'sydney', status: 'not-due' },
    ]);
    expect(post.mock.calls.map(([target]) => target.guildId)).toEqual(['london', 'new-york']);
  });

  it('follows the DST shift rather than a fixed offset', async () => {
    // 1 November 2026: New York is back on EST, so 9 a.m. is 14:00 UTC.
    const { scheduler } = harness([settings()]);
    expect(await scheduler.tick(new Date('2026-11-01T14:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'posted' },
    ]);
    // …and 13:00 UTC is now 8 a.m., which is not the hour.
    const second = harness([settings()]);
    expect(await second.scheduler.tick(new Date('2026-11-01T13:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'not-due' },
    ]);
  });
});

describe('the day-key guard', () => {
  it('posts once and then nothing for the rest of the hour', async () => {
    const { scheduler, post, keys } = harness([settings()]);

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('posted');
    // A restart at 9:05 is the same as a second tick: the key is already there.
    expect((await scheduler.tick(new Date('2026-10-27T13:05:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect((await scheduler.tick(new Date('2026-10-27T13:59:00.000Z')))[0].status).toBe(
      'already-posted',
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect([...keys]).toEqual(['guild-1:2026-10-27']);
  });

  it('does not spend a day key on a failure, so the next minute retries', async () => {
    const failure = harness([settings()], {
      result: async () => {
        throw new Error('Missing Access');
      },
    });

    expect(await failure.scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'guild-1', status: 'failed' },
    ]);
    expect(failure.keys.size).toBe(0);

    // The channel is fixed a minute later: the retry is allowed to post.
    const retry = harness([settings()]);
    expect((await retry.scheduler.tick(new Date('2026-10-27T13:01:00.000Z')))[0].status).toBe(
      'posted',
    );
  });

  it('records an empty day, so it is not re-checked all hour', async () => {
    const { scheduler, post, keys } = harness([settings()], {
      result: posted({ status: 'empty', games: 0, messageIds: [] }),
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('empty');
    expect((await scheduler.tick(new Date('2026-10-27T13:30:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect([...keys]).toEqual(['guild-1:2026-10-27']);
  });

  it('records an already-claimed slate the same way', async () => {
    const { scheduler, keys } = harness([settings()], {
      result: posted({ status: 'already-posted', games: 0, messageIds: [] }),
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('already-posted');
    expect(keys.size).toBe(1);
  });

  it('keys on the ET day, so a late-night post is one post, not two', async () => {
    // 23:30 UTC is 7:30 p.m. ET on the 27th; a guild posting at hour 19 gets the
    // 27th's slate under the 27th's key, whatever its own date is.
    const { scheduler, keys } = harness([settings({ timezone: 'Europe/London', postHour: 23 })]);

    expect((await scheduler.tick(new Date('2026-10-27T23:30:00.000Z')))[0].status).toBe('posted');
    expect([...keys]).toEqual(['guild-1:2026-10-27']);
  });
});

describe('the sweep as a whole', () => {
  it('does nothing at all when the bot is switched off', async () => {
    const { scheduler, post, listEnabled } = harness([settings()], { enabled: false });

    expect(await scheduler.tick(NINE_ET)).toEqual([]);
    expect(listEnabled).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps one guild’s failure away from the next', async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unknown Channel'))
      .mockResolvedValueOnce(posted({ messageIds: ['message-2'] }));

    const scheduler = new SlateScheduler(
      { enabled: true } as unknown as DiscordConfigService,
      {
        listEnabled: async () => [settings({ guildId: 'broken' }), settings({ guildId: 'fine' })],
      } as unknown as GuildConfigService,
      { post } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    expect(await scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'broken', status: 'failed' },
      { guildId: 'fine', status: 'posted' },
    ]);
  });

  it('does not start a second sweep while one is still running', async () => {
    let release: (result: PostResult) => void = () => {};
    const pending = new Promise<PostResult>((resolve) => {
      release = resolve;
    });
    const post = vi.fn(async () => pending);

    const scheduler = new SlateScheduler(
      { enabled: true } as unknown as DiscordConfigService,
      { listEnabled: async () => [settings()] } as unknown as GuildConfigService,
      { post } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    const first = scheduler.tick(NINE_ET);
    // A post that outlives its minute must not be joined by the next tick.
    expect(await scheduler.tick(new Date('2026-10-27T13:01:00.000Z'))).toEqual([]);
    release(posted());
    expect((await first)[0].status).toBe('posted');
    expect(post).toHaveBeenCalledTimes(1);

    // The guard is released: the next tick runs normally.
    expect((await scheduler.tick(new Date('2026-10-27T13:02:00.000Z')))[0].status).toBe('posted');
    expect(post).toHaveBeenCalledTimes(2);
  });
});
