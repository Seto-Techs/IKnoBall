import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayState } from './board';
import type { BoardRepository } from './board-repository';
import { BoardScheduler } from './board-scheduler';
import type { DayKeyGuard } from './day-key.guard';
import type { RecapPoster } from './recap-poster';
import { etDateKey } from './slate-date';
import type { SlatePoster } from './slate-poster';

/**
 * The minute cron that posts the daily board.
 *
 * The clock is an argument, so every case here is an exact instant. Nothing is mocked
 * beyond the collaborators: the scheduler never touches Discord or Postgres — it asks
 * `BoardRepository` which day to use and `RecapPoster` to send it.
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

/** 26 October: finished. */
const LAST_NIGHT: DayState = {
  slateKey: '2026-10-26',
  games: 2,
  finals: 2,
  lastTipOff: new Date('2026-10-26T23:30:00.000Z'),
};

/** 27 October: still live at 9 a.m. on the 27th, finished by the 28th. */
const TONIGHT: DayState = {
  slateKey: '2026-10-27',
  games: 2,
  finals: 0,
  lastTipOff: new Date('2026-10-27T23:30:00.000Z'),
};

/** 9 a.m. in New York on 27 October 2026. */
const NINE_ET = new Date('2026-10-27T13:00:00.000Z');
/** 9 a.m. in New York on 28 October 2026. */
const NINE_ET_NEXT = new Date('2026-10-28T13:00:00.000Z');

interface Harness {
  scheduler: BoardScheduler;
  post: ReturnType<typeof vi.fn>;
  postOffDay: ReturnType<typeof vi.fn>;
  hasGames: ReturnType<typeof vi.fn>;
  listEnabled: ReturnType<typeof vi.fn>;
  keys: Set<string>;
  /** The board keys only: the off-day note keeps its own keyspace. */
  boardKeys: () => string[];
}

function harness(
  guildList: GuildSettings[],
  options: {
    enabled?: boolean;
    /** The league days the repository answers with, or a function of the tick's clock. */
    days?: DayState[] | ((now: Date) => DayState[]);
    result?: 'posted' | 'skipped' | (() => Promise<'posted' | 'skipped'>);
    /** Whether the schedule has any game at all today. */
    games?: boolean;
    noteFails?: boolean;
  } = {},
): Harness {
  const keys = new Set<string>();
  const post = vi.fn(async () => {
    const result = options.result ?? 'posted';
    return typeof result === 'function' ? await result() : result;
  });
  const postOffDay = vi.fn(async () => {
    if (options.noteFails) throw new Error('Unknown Channel');
  });
  const hasGames = vi.fn(async () => options.games ?? true);
  const listEnabled = vi.fn(async () => guildList);

  const scheduler = new BoardScheduler(
    { enabled: options.enabled ?? true } as unknown as DiscordConfigService,
    { listEnabled } as unknown as GuildConfigService,
    {
      daysSince: async (now: Date) =>
        typeof options.days === 'function'
          ? options.days(now)
          : (options.days ?? [LAST_NIGHT, TONIGHT]),
    } as unknown as BoardRepository,
    { post } as unknown as RecapPoster,
    {
      postOffDay,
      hasGames,
      nextSlateDay: vi.fn(async (now: Date) => etDateKey(now)),
    } as unknown as SlatePoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  return {
    scheduler,
    post,
    postOffDay,
    hasGames,
    listEnabled,
    keys,
    boardKeys: () => [...keys].filter((key) => key.startsWith('recap:')).sort(),
  };
}

describe('the hour', () => {
  it('posts last night’s board when the guild’s own clock reaches its hour', async () => {
    const { scheduler, post, boardKeys } = harness([settings()]);

    expect(await scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'guild-1', day: '2026-10-26', status: 'posted' },
    ]);
    expect(post).toHaveBeenCalledWith({ guildId: 'guild-1', channelId: 'channel-1' }, '2026-10-26');
    expect(boardKeys()).toEqual(['recap:guild-1:2026-10-26']);
  });

  it('says nothing when the hour has already passed today', async () => {
    // 15:00 UTC is 11 a.m. in New York: 9 a.m. came and went.
    const { scheduler, post } = harness([settings()]);

    expect(await scheduler.tick(new Date('2026-10-27T15:00:00.000Z'))).toEqual([
      { guildId: 'guild-1', day: '2026-10-26', status: 'not-due' },
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for the guild’s own hour, not the server’s', async () => {
    // 13:00 UTC is midnight on the 28th in Sydney; its 9 a.m. is 22:00 UTC.
    const { scheduler } = harness([settings({ timezone: 'Australia/Sydney' })]);

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('not-due');
    expect((await scheduler.tick(new Date('2026-10-27T22:00:00.000Z')))[0].status).toBe('posted');
  });
});

describe('once a day', () => {
  it('does not post the same day twice inside the hour', async () => {
    const { scheduler, post } = harness([settings()]);

    await scheduler.tick(NINE_ET);

    // The minute cron gets sixty chances inside the hour; only the first spends a send.
    expect((await scheduler.tick(new Date('2026-10-27T13:01:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not remember a day the poster declined, so a late settlement still gets a board', async () => {
    const { scheduler, post, boardKeys } = harness([settings()], { result: 'skipped' });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('skipped');
    expect(boardKeys()).toEqual([]);

    // A settlement lands a minute later: the same tick now posts.
    const later = harness([settings()]);
    expect((await later.scheduler.tick(new Date('2026-10-27T13:01:00.000Z')))[0].status).toBe(
      'posted',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failed post, so the next minute retries it', async () => {
    const failing = harness([settings()], {
      result: () => Promise.reject(new Error('Missing Access')),
    });

    expect((await failing.scheduler.tick(NINE_ET))[0].status).toBe('failed');
    expect(failing.boardKeys()).toEqual([]);
  });

  it('posts the new day once the old one has already gone out', async () => {
    // The 27th is still live at 9 a.m. on the 27th, and final by the 28th.
    const days = (now: Date) =>
      now < NINE_ET_NEXT ? [LAST_NIGHT, TONIGHT] : [LAST_NIGHT, { ...TONIGHT, finals: 2 }];
    const { scheduler, boardKeys } = harness([settings()], { days });

    expect((await scheduler.tick(NINE_ET))[0].day).toBe('2026-10-26');
    expect((await scheduler.tick(NINE_ET_NEXT))[0]).toEqual({
      guildId: 'guild-1',
      day: '2026-10-27',
      status: 'posted',
    });
    expect(boardKeys()).toEqual(['recap:guild-1:2026-10-26', 'recap:guild-1:2026-10-27']);
  });
});

describe('the day', () => {
  it('posts nothing when no league day has finished', async () => {
    const { scheduler, post } = harness([settings()], { days: [TONIGHT] });

    expect(await scheduler.tick(NINE_ET)).toEqual([
      { guildId: 'guild-1', day: null, status: 'no-day' },
    ]);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('the off-day note', () => {
  it('tells a guild its day is off, keyed on today rather than the board’s day', async () => {
    const { scheduler, postOffDay, keys } = harness([settings()], { games: false });

    await scheduler.tick(NINE_ET);

    expect(postOffDay).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      null,
    );
    expect(keys.has('note:guild-1:2026-10-27')).toBe(true);
  });

  it('says it once, not every minute of the hour', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false });

    await scheduler.tick(NINE_ET);
    await scheduler.tick(new Date('2026-10-27T13:01:00.000Z'));

    expect(postOffDay).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on a day that has games', async () => {
    const { scheduler, postOffDay } = harness([settings()]);

    await scheduler.tick(NINE_ET);

    expect(postOffDay).not.toHaveBeenCalled();
  });

  it('does not cost the board when the note fails', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false, noteFails: true });

    expect((await scheduler.tick(NINE_ET))[0].status).toBe('posted');
    expect(postOffDay).toHaveBeenCalledTimes(1);
  });
});

describe('the sweep', () => {
  it('asks the database once for every guild, not once per guild', async () => {
    const days = vi.fn(async () => [LAST_NIGHT, TONIGHT]);
    const scheduler = new BoardScheduler(
      { enabled: true } as unknown as DiscordConfigService,
      {
        listEnabled: async () => [settings(), settings({ guildId: 'guild-2' })],
      } as unknown as GuildConfigService,
      { daysSince: days } as unknown as BoardRepository,
      { post: async () => 'posted' } as unknown as RecapPoster,
      {
        postOffDay: async () => {},
        hasGames: async () => true,
        nextSlateDay: async (now: Date) => etDateKey(now),
      } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    await scheduler.tick(NINE_ET);

    expect(days).toHaveBeenCalledTimes(1);
  });

  it('does not overlap a slow tick with the next minute', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { scheduler, post } = harness([settings()], {
      result: async () => {
        await gate;
        return 'posted';
      },
    });

    // The first tick is stuck inside the send when the next minute arrives.
    const first = scheduler.tick(NINE_ET);
    await new Promise((resolve) => setImmediate(resolve));

    expect(await scheduler.tick(NINE_ET)).toEqual([]);

    release();
    await first;
    expect(post).toHaveBeenCalledTimes(1);
  });
});
