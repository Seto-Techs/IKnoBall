import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayState } from './board';
import type { BoardRepository } from './board-repository';
import { BoardScheduler } from './board-scheduler';
import type { DayKeyGuard } from './day-key.guard';
import type { RecapPoster } from './recap-poster';
import { etDateKey } from './slate-date';
import type { SlatePoster, PostStatus, SlateTarget } from './slate-poster';

/**
 * The minute cron that posts the daily board.
 *
 * The clock is an argument, so every case here is an exact instant. Nothing is mocked
 * beyond the collaborators: the scheduler never touches Discord or Postgres — it asks
 * `BoardRepository` which day to use and `RecapPoster` to send it.
 *
 * The instants below are US/Eastern in late October, so EDT: midnight is 04:00 UTC and
 * noon is 16:00 UTC. The board floors at midnight; the off-day note still waits for noon.
 */

function settings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
    ...overrides,
  };
}

/** 26 October: finished, last buzzer at 02:00 UTC on the 27th. */
const LAST_NIGHT: DayState = {
  slateKey: '2026-10-26',
  games: 2,
  finals: 2,
  lastTipOff: new Date('2026-10-26T23:30:00.000Z'),
  lastFinalAt: new Date('2026-10-27T02:00:00.000Z'),
};

/** 27 October: still live when the 26th's board goes out, finished by the next midnight. */
const TONIGHT: DayState = {
  slateKey: '2026-10-27',
  games: 2,
  finals: 0,
  lastTipOff: new Date('2026-10-27T23:30:00.000Z'),
  lastFinalAt: null,
};

/** Midnight in New York on 27 October 2026, when the 26th's board falls due. */
const MIDNIGHT_ET = new Date('2026-10-27T04:00:00.000Z');
/** Midnight in New York on 28 October 2026, when the 27th's board falls due. */
const MIDNIGHT_ET_NEXT = new Date('2026-10-28T04:00:00.000Z');
/** Noon in New York on 27 October 2026: the off-day note's gate, not the board's. */
const NOON_ET = new Date('2026-10-27T16:00:00.000Z');

interface Harness {
  scheduler: BoardScheduler;
  post: ReturnType<typeof vi.fn>;
  postOffDay: ReturnType<typeof vi.fn>;
  postFor: ReturnType<typeof vi.fn>;
  nextSlateDay: ReturnType<typeof vi.fn>;
  hasGames: ReturnType<typeof vi.fn>;
  listEnabled: ReturnType<typeof vi.fn>;
  keys: Set<string>;
  /** The board keys only: the off-day note keeps its own keyspace. */
  boardKeys: () => string[];
  /** The card keys only. */
  cardKeys: () => string[];
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
    /** What the card post answers, or a function of the slate day it was asked for. */
    cards?: PostStatus | ((etKey: string) => PostStatus);
    /** What `nextSlateDay` names. */
    slateDay?: string | ((now: Date) => string);
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
  const postFor = vi.fn(async (_target: SlateTarget, etKey: string) => {
    const result = options.cards ?? 'posted';
    return {
      status: typeof result === 'function' ? result(etKey) : result,
      etKey,
      games: 0,
      messageIds: [],
    };
  });
  const nextSlateDay = vi.fn(async (now: Date) =>
    typeof options.slateDay === 'function'
      ? options.slateDay(now)
      : (options.slateDay ?? etDateKey(now)),
  );
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
      nextSlateDay,
      postFor,
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
    postFor,
    nextSlateDay,
    hasGames,
    listEnabled,
    keys,
    boardKeys: () => [...keys].filter((key) => key.startsWith('recap:')).sort(),
    cardKeys: () => [...keys].filter((key) => key.startsWith('cards:')).sort(),
  };
}

describe('when it is due', () => {
  it('posts last night’s board at midnight ET, even though the last buzzer was hours earlier', async () => {
    const { scheduler, post, boardKeys } = harness([settings()]);

    expect(await scheduler.tick(MIDNIGHT_ET)).toEqual([
      { guildId: 'guild-1', day: '2026-10-26', status: 'posted' },
    ]);
    expect(post).toHaveBeenCalledWith({ guildId: 'guild-1', channelId: 'channel-1' }, '2026-10-26');
    expect(boardKeys()).toEqual(['recap:guild-1:2026-10-26']);
  });

  it('holds the board until midnight, not until the day is finished', async () => {
    // 23:59 in New York: the 26th has been final for two hours and still waits.
    const { scheduler, post } = harness([settings()]);

    expect(await scheduler.tick(new Date('2026-10-27T03:59:00.000Z'))).toEqual([
      { guildId: 'guild-1', day: '2026-10-26', status: 'not-due' },
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for the last buzzer when it lands after midnight', async () => {
    // A delayed slate: the 26th's last game ends at 18:00 UTC on the 27th.
    const delayed: DayState = { ...LAST_NIGHT, lastFinalAt: new Date('2026-10-27T18:00:00.000Z') };
    const { scheduler, post } = harness([settings()], { days: [delayed, TONIGHT] });

    expect((await scheduler.tick(MIDNIGHT_ET))[0].status).toBe('not-due');
    expect(post).not.toHaveBeenCalled();

    // Fifteen minutes of settlement after the buzzer, then it goes out.
    expect((await scheduler.tick(new Date('2026-10-27T18:14:00.000Z')))[0].status).toBe('not-due');
    expect((await scheduler.tick(new Date('2026-10-27T18:15:00.000Z')))[0].status).toBe('posted');
  });

  it('is the same instant for every guild, whatever its zone', async () => {
    const { scheduler } = harness([
      settings(),
      settings({ guildId: 'guild-2', channelId: 'channel-2' }),
    ]);

    // 04:00 UTC is midnight in New York and 3 p.m. on the 27th in Sydney; both post.
    expect((await scheduler.tick(MIDNIGHT_ET)).map((outcome) => outcome.status)).toEqual([
      'posted',
      'posted',
    ]);
  });
});

describe('once a day', () => {
  it('does not post the same day twice inside the minute cron', async () => {
    const { scheduler, post } = harness([settings()]);

    await scheduler.tick(MIDNIGHT_ET);

    expect((await scheduler.tick(new Date('2026-10-27T04:01:00.000Z')))[0].status).toBe(
      'already-posted',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not remember a day the poster declined, so a late settlement still gets a board', async () => {
    const { scheduler, post, boardKeys } = harness([settings()], { result: 'skipped' });

    expect((await scheduler.tick(MIDNIGHT_ET))[0].status).toBe('skipped');
    expect(boardKeys()).toEqual([]);

    // A settlement lands a minute later: the same tick now posts.
    const later = harness([settings()]);
    expect((await later.scheduler.tick(new Date('2026-10-27T04:01:00.000Z')))[0].status).toBe(
      'posted',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failed post, so the next minute retries it', async () => {
    const failing = harness([settings()], {
      result: () => Promise.reject(new Error('Missing Access')),
    });

    expect((await failing.scheduler.tick(MIDNIGHT_ET))[0].status).toBe('failed');
    expect(failing.boardKeys()).toEqual([]);
  });

  it('posts the new day once the old one has already gone out', async () => {
    // The 27th is still live when its own midnight comes round, and final by the next one.
    const days = (now: Date) =>
      now < MIDNIGHT_ET_NEXT
        ? [LAST_NIGHT, TONIGHT]
        : [
            LAST_NIGHT,
            { ...TONIGHT, finals: 2, lastFinalAt: new Date('2026-10-28T03:00:00.000Z') },
          ];
    const { scheduler, boardKeys } = harness([settings()], { days });

    expect((await scheduler.tick(MIDNIGHT_ET))[0].day).toBe('2026-10-26');
    expect((await scheduler.tick(MIDNIGHT_ET_NEXT))[0]).toEqual({
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

    expect(await scheduler.tick(MIDNIGHT_ET)).toEqual([
      { guildId: 'guild-1', day: null, status: 'no-day' },
    ]);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('the cards', () => {
  it('posts the next slate’s cards alongside the board, at the same instant', async () => {
    const { scheduler, postFor, cardKeys } = harness([settings()]);

    await scheduler.tick(MIDNIGHT_ET);

    expect(postFor).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      MIDNIGHT_ET,
    );
    expect(cardKeys()).toEqual(['cards:guild-1:2026-10-27']);
  });

  it('posts them even when the board is skipped for having no settled picks', async () => {
    const { scheduler, postFor, post } = harness([settings()], { result: 'skipped' });

    expect((await scheduler.tick(MIDNIGHT_ET))[0].status).toBe('skipped');
    expect(post).toHaveBeenCalledTimes(1);
    expect(postFor).toHaveBeenCalledTimes(1);
  });

  it('posts them once, not every minute', async () => {
    const { scheduler, postFor } = harness([settings()]);

    await scheduler.tick(MIDNIGHT_ET);
    await scheduler.tick(new Date('2026-10-27T04:01:00.000Z'));
    await scheduler.tick(new Date('2026-10-27T04:02:00.000Z'));

    expect(postFor).toHaveBeenCalledTimes(1);
  });

  it('waits for the board’s gate, not for a clock of its own', async () => {
    // 23:59 ET: the 26th has been final for hours, and the cards wait with the board.
    const { scheduler, postFor } = harness([settings()]);

    expect((await scheduler.tick(new Date('2026-10-27T03:59:00.000Z')))[0].status).toBe('not-due');
    expect(postFor).not.toHaveBeenCalled();
  });

  it('does not spend the day on an empty slate, so a later crawl still gets cards', async () => {
    // The night of the 26th: nothing crawled for the 27th yet.
    const { scheduler, postFor, cardKeys } = harness([settings()], { cards: 'empty' });

    await scheduler.tick(MIDNIGHT_ET);

    expect(postFor).toHaveBeenCalledTimes(1);
    expect(cardKeys()).toEqual([]);
  });

  it('remembers a slate the poster says is already in the channel', async () => {
    const { scheduler, cardKeys } = harness([settings()], { cards: 'already-posted' });

    await scheduler.tick(MIDNIGHT_ET);

    expect(cardKeys()).toEqual(['cards:guild-1:2026-10-27']);
  });

  it('retries after a failure without losing the board', async () => {
    let attempts = 0;
    const { scheduler, postFor, cardKeys } = harness([settings()], {
      cards: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Missing Access');
        return 'posted';
      },
    });

    expect((await scheduler.tick(MIDNIGHT_ET))[0].status).toBe('posted');
    expect(cardKeys()).toEqual([]);

    // The next minute asks again, because the day key was never spent.
    await scheduler.tick(new Date('2026-10-27T04:01:00.000Z'));

    expect(postFor).toHaveBeenCalledTimes(2);
    expect(cardKeys()).toEqual(['cards:guild-1:2026-10-27']);
  });

  it('names the next pickable slate, not today, when the tick lands in the ET evening', async () => {
    // A catch-up post at 22:00 ET on the 27th: the 27th's games have all tipped off.
    const { scheduler, postFor } = harness([settings()], { slateDay: '2026-10-28' });

    await scheduler.tick(new Date('2026-10-28T02:00:00.000Z'));

    expect(postFor).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-28',
      new Date('2026-10-28T02:00:00.000Z'),
    );
  });
});

describe('the off-day note', () => {
  it('tells a guild its day is off, keyed on today rather than the board’s day', async () => {
    const { scheduler, postOffDay, keys } = harness([settings()], { games: false });

    await scheduler.tick(NOON_ET);

    expect(postOffDay).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-27',
      null,
    );
    expect(keys.has('note:guild-1:2026-10-27')).toBe(true);
  });

  it('says it once, not every minute after noon', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false });

    await scheduler.tick(NOON_ET);
    await scheduler.tick(new Date('2026-10-27T16:01:00.000Z'));

    expect(postOffDay).toHaveBeenCalledTimes(1);
  });

  it('stays quiet before noon', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false });

    await scheduler.tick(new Date('2026-10-27T13:00:00.000Z'));

    expect(postOffDay).not.toHaveBeenCalled();
  });

  it('stays quiet on a day that has games', async () => {
    const { scheduler, postOffDay } = harness([settings()]);

    await scheduler.tick(NOON_ET);

    expect(postOffDay).not.toHaveBeenCalled();
  });

  it('does not cost the board when the note fails', async () => {
    const { scheduler, postOffDay } = harness([settings()], { games: false, noteFails: true });

    expect((await scheduler.tick(NOON_ET))[0].status).toBe('posted');
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
        postFor: async (_target: SlateTarget, etKey: string) => ({
          status: 'posted' as const,
          etKey,
          games: 0,
          messageIds: [],
        }),
      } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    await scheduler.tick(MIDNIGHT_ET);

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
    const first = scheduler.tick(MIDNIGHT_ET);
    await new Promise((resolve) => setImmediate(resolve));

    expect(await scheduler.tick(MIDNIGHT_ET)).toEqual([]);

    release();
    await first;
    expect(post).toHaveBeenCalledTimes(1);
  });
});
