import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { ButtonStyle, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { APIEmbed } from 'discord.js';
import { ApiError, NotImplementedError } from '../api/errors';
import type { IknoballClient } from '../api/iknoball.client';
import type { PickWithGameResult } from '../api/types';
import { PicksCommand } from './picks.command';
import { picksPayload } from './picks-payload';

/** Far enough either side of the test's clock that ordering is never flaky. */
const PAST = '2020-01-01T00:30:00.000Z';
const SOONEST = '2999-01-01T00:30:00.000Z';
const SOON = '2999-01-02T00:30:00.000Z';
const LATER = '2999-03-01T00:30:00.000Z';
const SETTLED_AT = '2026-01-05T03:00:00.000Z';

function pickRow(overrides: Partial<PickWithGameResult> = {}): PickWithGameResult {
  return {
    gameId: '0022600001',
    mode: 'flat',
    side: 'home',
    lockedDecimal: null,
    lockedBook: null,
    lockedAt: null,
    points: null,
    status: 'pending',
    settledAt: null,
    homeTeam: 'Dallas Mavericks',
    awayTeam: 'Memphis Grizzlies',
    homeTricode: 'DAL',
    awayTricode: 'MEM',
    homeScore: null,
    awayScore: null,
    gameDateTime: SOON,
    gameStatus: 1,
    pendingPrice: false,
    ...overrides,
  };
}

interface PickOnOptions {
  side?: 'home' | 'away';
  /** Both rows share it: one submit settles both modes together. */
  status?: 'pending' | 'settled' | 'voided';
  settledAt?: string | null;
  flatPoints?: number | null;
  weightedPoints?: number | null;
  /** Weighted price locked at submit. Null is the deferred-payout state. */
  lockedDecimal?: number | null;
  gameStatus?: number | null;
  gameDateTime?: string | null;
}

/** One game's rows, as a single submit writes them: flat first, same side. */
function pickOn(gameId: string, options: PickOnOptions = {}): PickWithGameResult[] {
  const {
    side = 'home',
    status = 'pending',
    settledAt = null,
    flatPoints = null,
    weightedPoints = null,
    lockedDecimal = 1.8,
    gameStatus = 1,
    gameDateTime = SOON,
  } = options;

  const base = { gameId, side, status, settledAt, gameStatus, gameDateTime };

  return [
    pickRow({ ...base, mode: 'flat', points: flatPoints }),
    pickRow({
      ...base,
      mode: 'weighted',
      points: weightedPoints,
      lockedDecimal,
      pendingPrice: lockedDecimal === null && status === 'pending',
    }),
  ];
}

function fakeClient(
  overrides: {
    resolveLink?: (query: { discordUserId: string }) => Promise<{ userId: string | null }>;
    listPicks?: (query: { userId: string }) => Promise<PickWithGameResult[]>;
  } = {},
) {
  const resolveLink = vi.fn(overrides.resolveLink ?? (async () => ({ userId: 'user-1' })));
  const listPicks = vi.fn(overrides.listPicks ?? (async () => []));

  return {
    client: { resolveLink, listPicks } as unknown as IknoballClient,
    resolveLink,
    listPicks,
  };
}

function commandInteraction(options: { userId?: string; mode?: string | null } = {}) {
  const interaction = {
    commandName: 'picks',
    guildId: 'guild-1',
    createdTimestamp: Date.now(),
    user: { id: options.userId ?? 'discord-1' },
    deferred: false,
    replied: false,
    options: {
      getString: (name: string) => (name === 'mode' ? (options.mode ?? null) : null),
    },
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async (_payload: unknown) => undefined),
    reply: vi.fn(async (_payload: unknown) => undefined),
    followUp: vi.fn(async (_payload: unknown) => undefined),
  };

  return interaction;
}

type FakeInteraction = ReturnType<typeof commandInteraction>;

function asInteraction(interaction: FakeInteraction): ChatInputCommandInteraction {
  return interaction as unknown as ChatInputCommandInteraction;
}

interface ReplyPayload {
  content?: string;
  embeds?: APIEmbed[];
  components?: { components: { label: string; url: string; style: ButtonStyle }[] }[];
}

function replyOf(interaction: FakeInteraction): ReplyPayload {
  const [payload] = interaction.editReply.mock.calls[0] as [ReplyPayload];
  return payload;
}

function descriptionOf(interaction: FakeInteraction): string {
  return replyOf(interaction).embeds?.[0]?.description ?? '';
}

/** Every pick line in the reply, in render order. */
function linesOf(interaction: FakeInteraction): string[] {
  return descriptionOf(interaction)
    .split('\n')
    .filter((line) => line.includes(' @ ') || line.startsWith('Game '));
}

/** A `pickOn` fixture's tip-off as Discord's relative timestamp. */
function unix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

describe('PicksCommand', () => {
  // The failure paths log on purpose; the log is not what these tests assert.
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('acknowledges ephemerally before it calls the API', async () => {
    const { client, listPicks } = fakeClient();
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      listPicks.mock.invocationCallOrder[0],
    );
  });

  it('asks the API for the resolved user and no mode: the filter is local', async () => {
    const { client, listPicks, resolveLink } = fakeClient();

    await new PicksCommand(client).execute(asInteraction(commandInteraction({ mode: 'flat' })));

    expect(resolveLink).toHaveBeenCalledWith({ discordUserId: 'discord-1' });
    expect(listPicks).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('shows open picks before settled ones, soonest tip-off first', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-later', { gameDateTime: LATER }),
        ...pickOn('game-settled', {
          status: 'settled',
          settledAt: SETTLED_AT,
          flatPoints: 1,
          weightedPoints: 20,
          gameStatus: 3,
          gameDateTime: PAST,
        }),
        ...pickOn('game-soonest', { gameDateTime: SOONEST }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const description = descriptionOf(interaction);
    const lines = linesOf(interaction);
    expect(lines).toHaveLength(3);
    // Open first, and the one about to lock is on top.
    expect(lines[0]).toContain(`<t:${unix(SOONEST)}:R>`);
    expect(lines[1]).toContain(`<t:${unix(LATER)}:R>`);
    expect(lines[2]).toContain('✅');
    expect(description.indexOf('**Open picks**')).toBeLessThan(
      description.indexOf('**Recently settled**'),
    );
  });

  it('renders the side, the countdown and whether it can still change', async () => {
    const { client } = fakeClient({
      listPicks: async () => [...pickOn('game-1', { gameDateTime: SOON })],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(linesOf(interaction)[0]).toBe(
      `MEM @ **DAL** · <t:${unix(SOON)}:R> · changes until tip-off · 1 pt (flat) if correct · 18 pts (weighted) if correct`,
    );
  });

  it('bolds the away side when that is the pick', async () => {
    const { client } = fakeClient({
      listPicks: async () => [...pickOn('game-1', { side: 'away' })],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(linesOf(interaction)[0]).toContain('**MEM** @ DAL');
  });

  it('says a pick is locked once the game is no longer scheduled or tip-off has passed', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-live', { gameStatus: 2 }),
        ...pickOn('game-tipped', { gameStatus: 1, gameDateTime: PAST }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const lines = linesOf(interaction);
    expect(lines[0]).toContain('· locked ·');
    expect(lines[1]).toContain('· locked ·');
    expect(descriptionOf(interaction)).not.toContain('changes until tip-off');
  });

  it('caps the reply at ten rows and says how many were left out', async () => {
    const open = Array.from({ length: 12 }, (_, index) =>
      pickOn(`open-${String(index).padStart(2, '0')}`),
    ).flat();
    const settled = Array.from({ length: 6 }, (_, index) =>
      pickOn(`settled-${index}`, {
        status: 'settled',
        settledAt: SETTLED_AT,
        flatPoints: 1,
        weightedPoints: 20,
        gameStatus: 3,
        gameDateTime: PAST,
      }),
    ).flat();
    const { client } = fakeClient({ listPicks: async () => [...open, ...settled] });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const description = descriptionOf(interaction);
    expect(linesOf(interaction)).toHaveLength(10);
    // Ten open picks fill the cap, so no settled row fits at all.
    expect(description).toContain('**Open picks**');
    expect(description).not.toContain('**Recently settled**');
    expect(description).toContain('…and 2 more open picks and 6 more results. See all on the web.');
  });

  it('fills the rows the open picks leave with the last five settled', async () => {
    const open = Array.from({ length: 8 }, (_, index) =>
      pickOn(`open-${index}`, { gameDateTime: SOON }),
    ).flat();
    const settled = Array.from({ length: 7 }, (_, index) =>
      pickOn(`settled-${index}`, {
        status: 'settled',
        settledAt: SETTLED_AT,
        flatPoints: 0,
        weightedPoints: 0,
        gameStatus: 3,
        gameDateTime: PAST,
      }),
    ).flat();
    const { client } = fakeClient({ listPicks: async () => [...open, ...settled] });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const description = descriptionOf(interaction);
    const lines = linesOf(interaction);
    expect(lines).toHaveLength(10);
    expect(lines.filter((line) => line.startsWith('❌'))).toHaveLength(2);
    // Seven results settled, two fit under the eight open picks, so five are
    // hidden — the five-row window and the ten-row cap hide the same ones here.
    expect(description).toContain('…and 5 more results. See all on the web.');
    expect(description).not.toContain('more open picks');
  });

  it('says how many results are behind the web link when nothing is open', async () => {
    // The shape a real history has: nothing open, far more than five settled.
    const settled = Array.from({ length: 12 }, (_, index) =>
      pickOn(`settled-${String(index).padStart(2, '0')}`, {
        status: 'settled',
        settledAt: SETTLED_AT,
        flatPoints: 1,
        weightedPoints: 20,
        gameStatus: 3,
        gameDateTime: PAST,
      }),
    ).flat();
    const { client } = fakeClient({ listPicks: async () => settled });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const description = descriptionOf(interaction);
    expect(linesOf(interaction)).toHaveLength(5);
    expect(description).not.toContain('**Open picks**');
    expect(description).toContain('…and 7 more results. See all on the web.');
  });

  it('filters to one mode without asking the API for it', async () => {
    const { client, listPicks } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-1', {
          status: 'settled',
          settledAt: SETTLED_AT,
          flatPoints: 1,
          weightedPoints: 20,
          gameStatus: 3,
          gameDateTime: PAST,
        }),
        ...pickOn('game-2'),
      ],
    });
    const interaction = commandInteraction({ mode: 'flat' });

    await new PicksCommand(client).execute(asInteraction(interaction));

    const description = descriptionOf(interaction);
    expect(listPicks).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(replyOf(interaction).embeds?.[0]?.title).toBe('Your picks · flat');
    expect(description).toContain('1 pt (flat)');
    expect(description).not.toContain('(weighted)');
  });

  it('says a pending price cannot be scored yet instead of showing zero', async () => {
    const { client } = fakeClient({
      listPicks: async () => [...pickOn('game-1', { lockedDecimal: null })],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const line = linesOf(interaction)[0];
    expect(line).toContain('weighted points pending until the line opens');
    expect(line).not.toContain('0 pts');
  });

  it('will not score an unpriced weighted pick even if the flag is missing', async () => {
    // The backend derives `pendingPrice` from exactly this state, so the two can
    // only disagree if a caller built the row itself; 0 points would still be wrong.
    const { client } = fakeClient({
      listPicks: async () => [
        pickRow({ mode: 'weighted', lockedDecimal: null, pendingPrice: false }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const line = linesOf(interaction)[0];
    expect(line).toContain('weighted points pending until the line opens');
    expect(line).not.toContain('0 pts');
  });

  it('treats a voided pick as neither a win nor a loss', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-1', {
          status: 'voided',
          settledAt: SETTLED_AT,
          gameStatus: 3,
          gameDateTime: PAST,
        }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const line = linesOf(interaction)[0];
    expect(line).toContain('➖ MEM @ **DAL** · voided — no points either way');
    expect(line).not.toContain('✅');
    expect(line).not.toContain('❌');
    expect(line).not.toContain('0 pts');
  });

  it('marks a settled win with the points both modes earned', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-1', {
          status: 'settled',
          settledAt: SETTLED_AT,
          flatPoints: 1,
          weightedPoints: 20,
          gameStatus: 3,
          gameDateTime: PAST,
        }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(linesOf(interaction)[0]).toBe('✅ MEM @ **DAL** · 1 pt (flat) · 20 pts (weighted)');
  });

  it('marks a settled loss with the zero it actually scored', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        ...pickOn('game-1', {
          status: 'settled',
          settledAt: SETTLED_AT,
          flatPoints: 0,
          weightedPoints: 0,
          gameStatus: 3,
          gameDateTime: PAST,
        }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(linesOf(interaction)[0]).toBe('❌ MEM @ **DAL** · 0 pts (flat) · 0 pts (weighted)');
  });

  it('answers an empty history with a hint and the web link, not an empty embed', async () => {
    const { client } = fakeClient({ listPicks: async () => [] });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const reply = replyOf(interaction);
    expect(reply.content).toMatch(/no picks yet/i);
    expect(reply.embeds).toEqual([]);
    expect(reply.components?.[0].components[0].url).toBe('https://iknoball.setotechs.com/predict');
  });

  it('names the mode it is empty for', async () => {
    const { client } = fakeClient({ listPicks: async () => [] });
    const interaction = commandInteraction({ mode: 'weighted' });

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(replyOf(interaction).content).toContain('No **weighted** picks yet');
  });

  it('points an unlinked caller at /link instead of failing', async () => {
    const { client, listPicks } = fakeClient({ resolveLink: async () => ({ userId: null }) });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(listPicks).not.toHaveBeenCalled();
    expect(replyOf(interaction).content).toContain('`/link`');
  });

  it('treats a 404 or 409 from the API as an unlinked account', async () => {
    for (const status of [404, 409]) {
      const { client } = fakeClient({
        resolveLink: async () => {
          throw new ApiError(status, 'no linked user', '/internal/link');
        },
      });
      const interaction = commandInteraction();

      await new PicksCommand(client).execute(asInteraction(interaction));

      expect(replyOf(interaction).content).toContain('`/link`');
    }
  });

  it('answers an API failure with a plain try-again and never the raw error', async () => {
    for (const error of [
      new ApiError(500, 'relation "prediction_picks" does not exist', '/internal/picks'),
      new ApiError(0, 'ECONNREFUSED 10.0.0.5:5432', '/internal/picks'),
      new Error('boom'),
    ]) {
      const { client } = fakeClient({
        listPicks: async () => {
          throw error;
        },
      });
      const interaction = commandInteraction();

      await expect(
        new PicksCommand(client).execute(asInteraction(interaction)),
      ).resolves.toBeUndefined();

      const { content } = replyOf(interaction);
      expect(content).toContain('Could not load your picks. Try again in a moment');
      expect(content).not.toContain('prediction_picks');
      expect(content).not.toContain('ECONNREFUSED');
      expect(content).not.toContain('boom');
      expect(content).not.toContain('failed with 500');
    }
  });

  it('survives resolveLink() not being wired up yet', async () => {
    const { client } = fakeClient({
      resolveLink: async () => {
        throw new NotImplementedError('resolveLink');
      },
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(replyOf(interaction).content).toMatch(/not wired up yet/i);
  });

  it('offers a link button to the web pick history', async () => {
    const { client } = fakeClient({ listPicks: async () => [...pickOn('game-1')] });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    const [row] = replyOf(interaction).components ?? [];
    expect(row.components).toHaveLength(1);
    expect(row.components[0]).toMatchObject({
      label: 'See all on the web',
      url: 'https://iknoball.setotechs.com/predict',
      style: ButtonStyle.Link,
    });
  });

  it('keeps a pick whose schedule row is gone readable instead of throwing', async () => {
    const { client } = fakeClient({
      listPicks: async () => [
        pickRow({
          gameId: '0022609999',
          status: 'voided',
          settledAt: SETTLED_AT,
          homeTeam: null,
          awayTeam: null,
          homeTricode: null,
          awayTricode: null,
          gameDateTime: null,
          gameStatus: null,
        }),
      ],
    });
    const interaction = commandInteraction();

    await new PicksCommand(client).execute(asInteraction(interaction));

    expect(descriptionOf(interaction)).toContain(
      '➖ Game 0022609999 · voided — no points either way',
    );
  });
});

describe('picksPayload', () => {
  it('decides "can still change" from the clock it is given', () => {
    const tipOff = '2026-01-04T00:30:00.000Z';
    const picks = pickOn('game-1', { gameDateTime: tipOff });

    const before = picksPayload(picks, { now: Date.parse(tipOff) - 1000 });
    const after = picksPayload(picks, { now: Date.parse(tipOff) + 1000 });

    expect(before.embeds[0].description).toContain('changes until tip-off');
    expect(after.embeds[0].description).toContain('· locked ·');
  });

  it('treats a pick with no tip-off as locked, because the API would refuse a change', () => {
    const picks = pickOn('game-1', { gameDateTime: null });

    const payload = picksPayload(picks, { now: Date.parse(SOON) });

    expect(payload.embeds[0].description).toContain('tip-off TBD · locked');
  });
});
