import { describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayKeyGuard } from './day-key.guard';
import type { RecapPoster, RecapStatus } from './recap-poster';
import type { GuildRolloverState, RolloverRepository } from './rollover-repository';
import { RolloverScheduler } from './rollover-scheduler';
import type { PostResult, SlatePoster } from './slate-poster';

/**
 * The rollover cron: does it fire exactly once per finished day, with the right day
 * posted and the right day recapped?
 *
 * The clock is an argument and every collaborator is a fake, so each case is one
 * instant and one set of answers. Nothing here touches Discord, Postgres, or Redis.
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

function state(overrides: Partial<GuildRolloverState> = {}): GuildRolloverState {
  return {
    guildId: 'guild-1',
    lastPostedKey: '2026-10-30',
    dayOver: true,
    nextKey: '2026-10-31',
    ...overrides,
  };
}

function posted(overrides: Partial<PostResult> = {}): PostResult {
  return {
    status: 'posted',
    etKey: '2026-10-31',
    games: 7,
    messageIds: ['message-1'],
    ...overrides,
  };
}

interface Options {
  guilds?: GuildSettings[];
  states?: GuildRolloverState[];
  enabled?: boolean;
  post?: PostResult | (() => Promise<PostResult>);
  recap?: RecapStatus | (() => Promise<RecapStatus>);
  /** The states the second `statesForAllGuilds` call sees, if it differs. */
  then?: GuildRolloverState[];
}

interface Harness {
  scheduler: RolloverScheduler;
  postFor: ReturnType<typeof vi.fn>;
  recap: ReturnType<typeof vi.fn>;
  keys: Set<string>;
}

function harness(options: Options = {}): Harness {
  const keys = new Set<string>();
  const guilds = options.guilds ?? [settings()];

  let states = options.states ?? [state()];
  const statesForAllGuilds = vi.fn(async () => states);

  const postFor = vi.fn(async () => {
    const result = options.post ?? posted();
    return typeof result === 'function' ? await result() : result;
  });

  const recap = vi.fn(async () => {
    const result = options.recap ?? 'posted';
    return typeof result === 'function' ? await result() : result;
  });

  const scheduler = new RolloverScheduler(
    { enabled: options.enabled ?? true } as unknown as DiscordConfigService,
    { listEnabled: async () => guilds } as unknown as GuildConfigService,
    { statesForAllGuilds } as unknown as RolloverRepository,
    { postFor } as unknown as SlatePoster,
    { post: recap } as unknown as RecapPoster,
    {
      has: async (key: string) => keys.has(key),
      remember: async (key: string) => {
        keys.add(key);
      },
    } as unknown as DayKeyGuard,
  );

  // A second tick sees the state the first one left behind: the cards for the day it
  // just posted are in the table, so the guild's last day moves forward.
  if (options.then) {
    let tick = 0;
    statesForAllGuilds.mockImplementation(async () => {
      tick += 1;
      states = tick === 1 ? (options.states ?? [state()]) : options.then!;
      return states;
    });
  }

  return { scheduler, postFor, recap, keys };
}

/** A minute after the last game of 30 October ended. */
const AFTER_LAST_GAME = new Date('2026-10-31T04:05:00.000Z');

describe('rolling over', () => {
  it('posts the next day as soon as the last one is over', async () => {
    const { scheduler, postFor, recap } = harness();

    const [outcome] = await scheduler.tick(AFTER_LAST_GAME);

    // Not `post()`: the day being posted is tomorrow's ET day, which is not the ET
    // day of the clock until the small hours.
    expect(postFor).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-31',
      AFTER_LAST_GAME,
    );
    expect(outcome).toEqual({ guildId: 'guild-1', status: 'rolled', recap: 'posted' });
    // The recap is about the day that finished, not the one just posted.
    expect(recap).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1' },
      '2026-10-30',
    );
  });

  it('does not post a second slate when the next tick sees the same day', async () => {
    const { scheduler, postFor } = harness();

    await scheduler.tick(AFTER_LAST_GAME);
    const [second] = await scheduler.tick(AFTER_LAST_GAME);

    expect(postFor).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('already-posted');
  });

  it('does nothing once the guild has moved onto the new day', async () => {
    const { scheduler, postFor, recap } = harness({
      states: [state()],
      then: [state({ lastPostedKey: '2026-10-31', dayOver: false, nextKey: '2026-11-01' })],
    });

    await scheduler.tick(AFTER_LAST_GAME);
    const [second] = await scheduler.tick(AFTER_LAST_GAME);

    expect(postFor).toHaveBeenCalledTimes(1);
    expect(recap).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('day-open');
    expect(second.recap).toBeNull();
  });

  it('leaves the day alone while a game on it is still live', async () => {
    const { scheduler, postFor, recap } = harness({ states: [state({ dayOver: false })] });

    const [outcome] = await scheduler.tick(AFTER_LAST_GAME);

    expect(postFor).not.toHaveBeenCalled();
    expect(recap).not.toHaveBeenCalled();
    expect(outcome.status).toBe('day-open');
  });

  it('skips a guild that has never been posted', async () => {
    // A guild with no cards is not in the repository's answer at all: a schedule it
    // never chose is not something to roll over.
    const { scheduler, postFor } = harness({ states: [] });

    expect(await scheduler.tick(AFTER_LAST_GAME)).toEqual([]);
    expect(postFor).not.toHaveBeenCalled();
  });

  it('does not remember a day the schedule had no games for', async () => {
    // An empty slate is usually the crawler being late, not the league being idle.
    // Recording it would block the guild's timed post for the rest of the day.
    const { scheduler, keys } = harness({ post: () => posted({ status: 'empty', games: 0 }) });

    const [outcome] = await scheduler.tick(AFTER_LAST_GAME);

    expect(outcome.status).toBe('empty');
    expect(keys.has('guild-1:2026-10-31')).toBe(false);
  });
});

describe('the recap', () => {
  it('is posted once, and never twice for the same day', async () => {
    const { scheduler, recap, keys } = harness();

    await scheduler.tick(AFTER_LAST_GAME);
    await scheduler.tick(AFTER_LAST_GAME);

    expect(recap).toHaveBeenCalledTimes(1);
    expect(keys.has('recap:guild-1:2026-10-30')).toBe(true);
  });

  it('is skipped when nobody in the server picked', async () => {
    const { scheduler, recap, keys } = harness({ recap: 'skipped' });

    const [outcome] = await scheduler.tick(AFTER_LAST_GAME);

    expect(outcome.recap).toBe('skipped');
    // The poster was asked; it declined because the day had no settled picks.
    expect(recap).toHaveBeenCalledTimes(1);
    // Not remembered, so a day whose settlement lands a minute later can still get it.
    expect(keys.has('recap:guild-1:2026-10-30')).toBe(false);
  });

  it('does not undo the slate when it fails', async () => {
    const { scheduler } = harness({
      recap: () => {
        throw new Error('the API is down');
      },
    });

    const [outcome] = await scheduler.tick(AFTER_LAST_GAME);

    expect(outcome).toEqual({ guildId: 'guild-1', status: 'rolled', recap: 'failed' });
  });
});

describe('isolation', () => {
  it('keeps rolling the other guilds when one of them throws', async () => {
    const { scheduler, postFor, recap } = harness({
      guilds: [settings(), settings({ guildId: 'guild-2', channelId: 'channel-2' })],
      states: [
        state({ guildId: 'guild-1' }),
        state({ guildId: 'guild-2', lastPostedKey: '2026-10-29', nextKey: '2026-10-31' }),
      ],
    });

    postFor.mockRejectedValueOnce(new Error('channel-1 is missing Send Messages'));

    const outcomes = await scheduler.tick(AFTER_LAST_GAME);

    expect(outcomes).toEqual([
      { guildId: 'guild-1', status: 'failed', recap: null },
      { guildId: 'guild-2', status: 'rolled', recap: 'posted' },
    ]);
    expect(recap).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all while the kill switch is off', async () => {
    const { scheduler, postFor, recap } = harness({ enabled: false });

    expect(await scheduler.tick(AFTER_LAST_GAME)).toEqual([]);
    expect(postFor).not.toHaveBeenCalled();
    expect(recap).not.toHaveBeenCalled();
  });
});
