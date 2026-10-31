import { describe, expect, it, vi } from 'vitest';
import { forceSlate, parseArgs, type Args, type ForceDeps, type Target } from './force-slate';
import type { PostResult } from '../scheduler/slate-poster';
import type { SlateGame } from '../scheduler/slate';

/** 15:00 UTC on 31 October is 11:00 in New York: the ET day is still the 31st. */
const NOW = new Date('2026-10-31T15:00:00.000Z');

const GUILD: Target = { guildId: '111111111111111111', channelId: '222222222222222222' };

function game(overrides: Partial<SlateGame> = {}): SlateGame {
  return {
    gameId: '0022600147',
    gameStatus: 1,
    gameDate: '2026-10-31',
    gameDateTimeUTC: new Date('2026-10-31T23:00:00.000Z'),
    awayTeamTricode: 'POR',
    awayTeamCity: 'Portland',
    awayTeamName: 'Trail Blazers',
    homeTeamTricode: 'UTA',
    homeTeamCity: 'Utah',
    homeTeamName: 'Jazz',
    seriesText: null,
    ...overrides,
  };
}

function posted(overrides: Partial<PostResult> = {}): PostResult {
  return {
    status: 'posted',
    etKey: '2026-10-31',
    games: 7,
    messageIds: ['333333333333333333', '444444444444444444'],
    threadId: '555555555555555555',
    ...overrides,
  };
}

interface Harness {
  deps: ForceDeps;
  said: string[];
  depsOf: {
    plan: ReturnType<typeof vi.fn>;
    postFor: ReturnType<typeof vi.fn>;
    hydrate: ReturnType<typeof vi.fn>;
  };
}

function harness(overrides: Partial<ForceDeps> = {}): Harness {
  const said: string[] = [];
  const plan = vi.fn(async (): Promise<SlateGame[]> => [game()]);
  const postFor = vi.fn(async (): Promise<PostResult> => posted());
  const hydrate = vi.fn(async () => {});

  const deps: ForceDeps = {
    guilds: {
      get: async (guildId) => (guildId === GUILD.guildId ? GUILD : null),
      listEnabled: async () => [GUILD],
    },
    poster: { plan, postFor },
    hydrate,
    out: (line) => said.push(line),
    ...overrides,
  };

  return { deps, said, depsOf: { plan, postFor, hydrate } };
}

function args(overrides: Partial<Args> = {}): Args {
  return { all: false, dryRun: false, help: false, guild: GUILD.guildId, ...overrides };
}

describe('parseArgs', () => {
  it('reads a guild and a day', () => {
    expect(parseArgs(['--guild', '123', '--day', '2026-10-31'])).toEqual({
      guild: '123',
      all: false,
      day: '2026-10-31',
      dryRun: false,
      help: false,
    });
  });

  it('reads --all', () => {
    expect(parseArgs(['--all', '--dry-run'])).toMatchObject({ all: true, dryRun: true });
  });

  it('refuses to guess which servers to post to', () => {
    expect(() => parseArgs([])).toThrow(/exactly one of --guild/);
    expect(() => parseArgs(['--guild', '123', '--all'])).toThrow(/exactly one of --guild/);
  });

  it('refuses a flag with no value, rather than swallowing the next one', () => {
    expect(() => parseArgs(['--guild', '--all'])).toThrow(/--guild needs a value/);
    expect(() => parseArgs(['--day'])).toThrow(/--day needs a value/);
  });

  it('refuses an unknown flag', () => {
    expect(() => parseArgs(['--guild', '123', '--force'])).toThrow(/Unknown argument "--force"/);
  });

  it('answers --help even from a half-written command', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['--day', '2026-10-31', '-h']).help).toBe(true);
  });
});

describe('forceSlate', () => {
  it('posts through the shared poster and prints the links', async () => {
    const { deps, said, depsOf } = harness();

    await expect(forceSlate(args(), deps, NOW)).resolves.toBe(0);

    expect(depsOf.postFor).toHaveBeenCalledWith(GUILD, '2026-10-31', NOW);
    expect(depsOf.hydrate).toHaveBeenCalledWith(GUILD.guildId);
    expect(said[0]).toBe('Slate — Oct 31 (ET)');
    expect(said.join('\n')).toContain(
      `https://discord.com/channels/${GUILD.guildId}/${GUILD.channelId}/333333333333333333`,
    );
    expect(said.join('\n')).toContain(
      `thread <https://discord.com/channels/${GUILD.guildId}/555555555555555555>`,
    );
  });

  it('defaults the day to the ET day of the instant it is given', async () => {
    const { deps, depsOf } = harness();

    // 02:00 UTC on the 1st is still the 31st in New York.
    await forceSlate(
      args({ guild: GUILD.guildId, day: undefined }),
      deps,
      new Date('2026-11-01T02:00:00.000Z'),
    );

    expect(depsOf.postFor).toHaveBeenCalledWith(GUILD, '2026-10-31', expect.any(Date));
  });

  it('refuses a day that is not a real calendar day, before touching anything', async () => {
    const { deps, said, depsOf } = harness();

    await expect(forceSlate(args({ day: '2026-02-31' }), deps, NOW)).resolves.toBe(2);

    expect(said).toEqual(['"2026-02-31" is not a day. Use YYYY-MM-DD, e.g. 2026-10-31.']);
    expect(depsOf.postFor).not.toHaveBeenCalled();
  });

  it('sends nothing in a dry run', async () => {
    const { deps, said, depsOf } = harness();

    await expect(forceSlate(args({ dryRun: true }), deps, NOW)).resolves.toBe(0);

    expect(depsOf.postFor).not.toHaveBeenCalled();
    expect(depsOf.hydrate).not.toHaveBeenCalled();
    const printed = said.join('\n');
    expect(printed).toContain('dry run');
    expect(printed).toContain('1 card would go out');
    // 23:00 UTC is 19:00 in New York.
    expect(printed).toContain('19:00 ET');
    expect(printed).toContain('POR @ UTA');
  });

  it('says so when a server has never been set up', async () => {
    const { deps, said, depsOf } = harness();

    await expect(forceSlate(args({ guild: '999' }), deps, NOW)).resolves.toBe(1);

    expect(said.join('\n')).toContain('Run /setup channel:#nba there first');
    expect(depsOf.postFor).not.toHaveBeenCalled();
  });

  it('explains an already-posted day instead of posting it twice', async () => {
    const { deps, said } = harness();
    deps.poster.postFor = async () =>
      posted({ status: 'already-posted', games: 0, messageIds: [], threadId: null });

    await expect(forceSlate(args(), deps, NOW)).resolves.toBe(0);

    const printed = said.join('\n');
    expect(printed).toContain('already claimed for this server');
    expect(printed).toContain('discord_cards');
    expect(printed).not.toContain('https://discord.com/channels');
  });

  it('reports an empty day without calling it a failure', async () => {
    const { deps, said } = harness();
    deps.poster.postFor = async () =>
      posted({ status: 'empty', games: 0, messageIds: [], threadId: null });

    await expect(forceSlate(args(), deps, NOW)).resolves.toBe(0);

    expect(said.join('\n')).toContain('no game that day is still open for picks');
  });

  it('keeps going when one guild fails, and fails the run', async () => {
    const other: Target = { guildId: '777', channelId: '888' };
    const { deps, said, depsOf } = harness();
    deps.guilds.listEnabled = async () => [GUILD, other];
    depsOf.postFor.mockImplementation(async (target: Target) => {
      if (target.guildId === GUILD.guildId) throw new Error('channel 222 is missing Send Messages');
      return posted();
    });

    await expect(forceSlate(args({ all: true }), deps, NOW)).resolves.toBe(1);

    const printed = said.join('\n');
    expect(printed).toContain('111111111111111111: failed — channel 222 is missing Send Messages');
    expect(printed).toContain(`https://discord.com/channels/777/888/333333333333333333`);
  });

  it('says so when --all finds no configured server', async () => {
    const { deps, said, depsOf } = harness();
    deps.guilds.listEnabled = async () => [];

    await expect(forceSlate(args({ guild: undefined, all: true }), deps, NOW)).resolves.toBe(1);

    expect(said).toEqual(['No server has a slate channel yet: nobody has run /setup.']);
    expect(depsOf.postFor).not.toHaveBeenCalled();
  });
});
