import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayKeyGuard } from './day-key.guard';
import { etDateKey } from './slate-date';
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
  postFor: ReturnType<typeof vi.fn>;
  postOffDay: ReturnType<typeof vi.fn>;
  hasGames: ReturnType<typeof vi.fn>;
  nextSlateDay: ReturnType<typeof vi.fn>;
  listEnabled: ReturnType<typeof vi.fn>;
  keys: Set<string>;
  /** The slate keys only: the off-day note keeps its own keyspace. */
  slateKeys: () => string[];
}

function harness(
  guildList: GuildSettings[],
  options: {
    enabled?: boolean;
    result?: PostResult | (() => Promise<PostResult>);
    /** The day the poster says its slate is for; today's when omitted. */
    nextDay?: string;
    /** Whether the schedule has any game at all on the guild's day. */
    games?: boolean;
    noteFails?: boolean;
  } = {},
): Harness {
  const keys = new Set<string>();
  const postFor = vi.fn(async (_target: unknown, _etKey: string, _now: Date) => {
    const result = options.result ?? posted();
    return typeof result === 'function' ? await result() : result;
  });
  const postOffDay = vi.fn(async () => {
    if (options.noteFails) throw new Error('Unknown Channel');
  });
  const hasGames = vi.fn(async () => options.games ?? true);
  const nextSlateDay = vi.fn(async (now: Date) => options.nextDay ?? etDateKey(now));
  const listEnabled = vi.fn(async () => guildList);

  const scheduler = new SlateScheduler(
    { enabled: options.enabled ?? true } as unknown as DiscordConfigService,
    { listEnabled } as unknown as GuildConfigService,
    { postFor, postOffDay, hasGames, nextSlateDay } as unknown as SlatePoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  return {
    scheduler,
    postFor,
    postOffDay,
    hasGames,
    nextSlateDay,
    listEnabled,
    keys,
    slateKeys: () => [...keys].filter((key) => !key.startsWith('note:')),
  };
}

/** 9 a.m. in New York on 27 October 2026. */
const NINE_ET = new Date('2026-10-27T13:00:00.000Z');

describe('the local hour', () => {
  it('posts when the guild’s own clock reaches its hour', async () => {
    const { scheduler, postFor, slateKeys } = harness([settings()]);

    expect(await scheduler.tick(NINE_ET)).toEqual([{ guildId: 'guild-1', status: 'posted' }]);
    expect(postFor).toHaveBeenCalledTimes(1);
    expect(postFor).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      NINE_ET,
    );
    expect(slateKeys()).toEqual(['guild-1:2026-10-27']);
  });

  it('says nothing when the hour has already passed today', async () => {
    // 15:00 UTC is 11 a.m. in New York: 9 a.m. came and went.
    const { scheduler, postFor } = harness([settings({ postHour: 9 })]);

    expect(await scheduler.tick(new Date('2026-10-27T15:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'not-due' },
    ]);
    expect(postFor).not.toHaveBeenCalled();
  });

  it('says nothing when the guild’s hour is still tomorrow', async () => {
    // 13:00 UTC is midnight on the 28th in Sydney; its 9 a.m. is 22:00 UTC.
    const { scheduler, postFor } = harness([
      settings({ timezone: 'Australia/Sydney', postHour: 9 }),
    ]);

    expect(await scheduler.tick(NINE_ET)).toEqual([{ guildId: 'guild-1', status: 'not-due' }]);
    expect(postFor).not.toHaveBeenCalled();

    expect(await scheduler.tick(new Date('2026-10-27T22:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', status: 'posted' },
    ]);
  });

  it('gives two guilds their own hours at the same instant', async () => {
    const { scheduler, postFor } = harness([
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
    expect(postFor.mock.calls.map(([target]) => (target as { guildId: string }).guildId)).toEqual([
      'london',
      'new-york',
    ]);
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

describe('the slate day', () => {
  it('posts the day the poster names, not the guild’s own date', async () => {
    // 9 a.m. in Jakarta is 10 p.m. the night before in New York, so the ET day the
    // guild is *in* is yesterday's — and every card on it has already tipped.
    const { scheduler, postFor, slateKeys } = harness(
      [settings({ timezone: 'Asia/Jakarta', postHour: 9 })],
      { nextDay: '2026-11-04' },
    );

    const noon = new Date('2026-11-04T02:00:00.000Z');

    expect((await scheduler.tick(noon))[0].status).toBe('posted');
    expect(postFor).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-11-04',
      noon,
    );
    // The key follows the slate, so the 4th cannot be posted twice from the 4th.
    expect(slateKeys()).toEqual(['guild-1:2026-11-04']);
  });
});

describe('the day-key guard', () => {
  it('posts once and then nothing for the rest of the hour', async () => {
    const { scheduler, postFor, slateKeys } = harness([settings()]);

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('posted');
    // A restart at 9:05 is the same as a second tick: the key is already there.
    expect((await scheduler.tick(new Date('2026-10-27T13:05:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect((await scheduler.tick(new Date('2026-10-27T13:59:00.000Z')))[0].status).toBe(
      'already-posted',
    );

    expect(postFor).toHaveBeenCalledTimes(1);
    expect(slateKeys()).toEqual(['guild-1:2026-10-27']);
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
    const { scheduler, postFor, slateKeys } = harness([settings()], {
      result: posted({ status: 'empty', games: 0, messageIds: [] }),
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('empty');
    expect((await scheduler.tick(new Date('2026-10-27T13:30:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect(postFor).toHaveBeenCalledTimes(1);
    expect(slateKeys()).toEqual(['guild-1:2026-10-27']);
  });

  it('records an already-claimed slate the same way', async () => {
    const { scheduler, slateKeys } = harness([settings()], {
      result: posted({ status: 'already-posted', games: 0, messageIds: [] }),
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('already-posted');
    expect(slateKeys()).toHaveLength(1);
  });

  it('keys on the ET day, so a late-night post is one post, not two', async () => {
    // 23:30 UTC is 7:30 p.m. ET on the 27th; a guild posting at hour 19 gets the
    // 27th's slate under the 27th's key, whatever its own date is.
    const { scheduler, slateKeys } = harness([
      settings({ timezone: 'Europe/London', postHour: 23 }),
    ]);

    expect((await scheduler.tick(new Date('2026-10-27T23:30:00.000Z')))[0].status).toBe('posted');
    expect(slateKeys()).toEqual(['guild-1:2026-10-27']);
  });
});

describe('a day with no games', () => {
  it('says so, and names the slate that follows', async () => {
    const { scheduler, postFor, postOffDay, hasGames } = harness([settings()], {
      result: posted({ status: 'empty', games: 0, messageIds: [] }),
      nextDay: '2026-10-28',
      games: false,
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('empty');
    // The slate is still attempted first: the schedule is the authority on what
    // was pickable, and the note is about what is not there at all.
    expect(postFor).toHaveBeenCalledTimes(1);
    expect(hasGames).toHaveBeenCalledWith('2026-10-27');
    expect(postOffDay).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      '2026-10-28',
    );
  });

  it('says the schedule does not reach that far when nothing follows', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false });

    await scheduler.tick(NINE_ET);

    // Today is the only day the poster could name, so there is no next day to give.
    expect(postOffDay).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      null,
    );
  });

  it('stays quiet on a day that has games', async () => {
    const { scheduler, postOffDay } = harness([settings()]);

    await scheduler.tick(NINE_ET);

    expect(postOffDay).not.toHaveBeenCalled();
  });

  it('notes once, however many minutes of the hour are left', async () => {
    const { scheduler, postOffDay } = harness([settings()], {
      nextDay: '2026-10-28',
      games: false,
    });

    await scheduler.tick(NINE_ET);
    await scheduler.tick(new Date('2026-10-27T13:05:00.000Z'));
    await scheduler.tick(new Date('2026-10-27T13:59:00.000Z'));

    expect(postOffDay).toHaveBeenCalledTimes(1);
  });

  it('keeps the note’s key away from the slate’s, so neither suppresses the other', async () => {
    const { scheduler, postFor, postOffDay, keys } = harness([settings()], {
      nextDay: '2026-10-28',
      games: false,
    });

    await scheduler.tick(NINE_ET);

    expect([...keys].sort()).toEqual(['guild-1:2026-10-28', 'note:guild-1:2026-10-27']);

    // A second tick in the hour is still the same slate, so the note's key cannot
    // have been what stopped the post — the slate's key was.
    await scheduler.tick(new Date('2026-10-27T13:30:00.000Z'));
    expect(postFor).toHaveBeenCalledTimes(1);
    expect(postOffDay).toHaveBeenCalledTimes(1);
  });

  it('does not turn a failed note into a failed slate', async () => {
    const { scheduler, postOffDay } = harness([settings()], {
      result: posted({ status: 'empty', games: 0, messageIds: [] }),
      nextDay: '2026-10-28',
      games: false,
      noteFails: true,
    });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('empty');
    expect(postOffDay).toHaveBeenCalledTimes(1);
  });
});

describe('the sweep as a whole', () => {
  it('does nothing at all when the bot is switched off', async () => {
    const { scheduler, postFor, listEnabled } = harness([settings()], { enabled: false });

    expect(await scheduler.tick(NINE_ET)).toEqual([]);
    expect(listEnabled).not.toHaveBeenCalled();
    expect(postFor).not.toHaveBeenCalled();
  });

  it('keeps one guild’s failure away from the next', async () => {
    const postFor = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unknown Channel'))
      .mockResolvedValueOnce(posted({ messageIds: ['message-2'] }));

    const scheduler = new SlateScheduler(
      { enabled: true } as unknown as DiscordConfigService,
      {
        listEnabled: async () => [settings({ guildId: 'broken' }), settings({ guildId: 'fine' })],
      } as unknown as GuildConfigService,
      {
        postFor,
        postOffDay: async () => {},
        hasGames: async () => true,
        nextSlateDay: async (now: Date) => etDateKey(now),
      } as unknown as SlatePoster,
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
    const postFor = vi.fn(async () => pending);

    const scheduler = new SlateScheduler(
      { enabled: true } as unknown as DiscordConfigService,
      { listEnabled: async () => [settings()] } as unknown as GuildConfigService,
      {
        postFor,
        postOffDay: async () => {},
        hasGames: async () => true,
        nextSlateDay: async (now: Date) => etDateKey(now),
      } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    const first = scheduler.tick(NINE_ET);
    // A post that outlives its minute must not be joined by the next tick.
    expect(await scheduler.tick(new Date('2026-10-27T13:01:00.000Z'))).toEqual([]);
    release(posted());
    expect((await first)[0].status).toBe('posted');
    expect(postFor).toHaveBeenCalledTimes(1);

    // The guard is released: the next tick runs normally.
    expect((await scheduler.tick(new Date('2026-10-27T13:02:00.000Z')))[0].status).toBe('posted');
    expect(postFor).toHaveBeenCalledTimes(2);
  });
});
