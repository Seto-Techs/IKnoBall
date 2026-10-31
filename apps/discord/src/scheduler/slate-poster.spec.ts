import { describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import type { CardTeam } from '../cards/types';
import type { Infrastructure } from './infrastructure';
import type { SlateGame } from './slate';
import { SlatePoster } from './slate-poster';
import type { CardClaim, SlateStore } from './slate-store';

/**
 * Posting one day's slate, against a fake gateway and a fake store.
 *
 * The order of the steps is the thing under test — claim the cards, send each card
 * as its own message, attach the id — because that order is what makes a restart
 * at 9:05 harmless. Everything Discord does is a fake; the real SQL is exercised by
 * the chunk's live proof.
 */

function game(index: number, overrides: Partial<SlateGame> = {}): SlateGame {
  return {
    gameId: `00226001${String(20 + index)}`,
    gameStatus: 1,
    gameDate: '2026-10-27',
    gameDateTimeUTC: new Date(Date.parse('2026-10-27T23:30:00.000Z') + index * 900_000),
    awayTeamTricode: 'BKN',
    awayTeamCity: 'Brooklyn',
    awayTeamName: 'Nets',
    homeTeamTricode: 'BOS',
    homeTeamCity: 'Boston',
    homeTeamName: 'Celtics',
    seriesText: null,
    ...overrides,
  };
}

const MORNING = new Date('2026-10-27T13:00:00.000Z');

interface FakeChannel {
  id: string;
  isSendable: () => boolean;
  send: ReturnType<typeof vi.fn>;
}

/**
 * A channel whose every send returns a new message, as the real one does — the
 * poster posts one message per card, so a fake that returns the same message twice
 * would hide a bookkeeping bug.
 */
function fakeDiscord(options: { sendable?: boolean; trace?: string[]; messages?: string[] } = {}) {
  const order: string[] = options.trace ?? [];
  const messageIds: string[] = options.messages ?? [];
  let counter = 0;

  const channel: FakeChannel = {
    id: 'channel-1',
    isSendable: () => options.sendable ?? true,
    send: vi.fn(async () => {
      order.push('channelSend');
      counter += 1;
      const id = `message-${counter}`;
      messageIds.push(id);
      return { id } as Message;
    }),
  };

  const client = { channels: { fetch: vi.fn(async () => channel) } };

  return {
    channel,
    order,
    messageIds,
    client,
    infra: { client } as unknown as Infrastructure,
  };
}

function fakeStore(
  games: SlateGame[],
  options: {
    claim?: (gameIds: string[]) => string[];
    attachFails?: boolean;
    trace?: string[];
  } = {},
) {
  const order: string[] = options.trace ?? [];
  const claims: CardClaim[][] = [];
  const attachments: { gameId: string; guildId: string; channelId: string; messageId: string }[][] =
    [];
  const teams: CardTeam[] = [
    { tricode: 'BOS', name: 'Boston Celtics', logoUrl: null, record: null },
  ];

  const store: SlateStore = {
    async findGames(etKey: string) {
      order.push(`findGames:${etKey}`);
      return games;
    },
    async findTeams() {
      return teams;
    },
    async findStakes() {
      return new Map();
    },
    async claimCards(batch) {
      order.push('claimCards');
      claims.push([...batch]);
      return options.claim
        ? options.claim(batch.map((claim) => claim.gameId))
        : batch.map((claim) => claim.gameId);
    },
    async attachCards(batch) {
      order.push(`attachCards:${batch.map((attachment) => attachment.messageId).join('|')}`);
      if (options.attachFails) throw new Error('connection reset');
      attachments.push([...batch]);
    },
  };

  return { store, order, claims, attachments };
}

const TARGET = { guildId: 'guild-1', channelId: 'channel-1' };

describe('an empty day', () => {
  it('posts nothing and sends nothing', async () => {
    const discord = fakeDiscord();
    const { store, order } = fakeStore([]);
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result).toEqual({
      status: 'empty',
      etKey: '2026-10-27',
      games: 0,
      messageIds: [],
    });
    expect(order).toEqual(['findGames:2026-10-27']);
    expect(discord.client.channels.fetch).not.toHaveBeenCalled();
  });
});

describe('the claim comes before the send', () => {
  it('writes the card rows first, so a crash cannot double-post', async () => {
    // One shared trace: the store records the SQL steps, the fake channel the
    // send, so the sequence is exactly what the poster did.
    const trace: string[] = [];
    const discord = fakeDiscord({ trace });
    const { store, attachments } = fakeStore([game(0), game(1)], { trace });
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    expect(trace).toEqual([
      'findGames:2026-10-27',
      'claimCards',
      'channelSend',
      'attachCards:message-1',
      'channelSend',
      'attachCards:message-2',
    ]);
    expect(attachments).toEqual([
      [
        {
          gameId: '0022600120',
          guildId: 'guild-1',
          channelId: 'channel-1',
          messageId: 'message-1',
        },
      ],
      [
        {
          gameId: '0022600121',
          guildId: 'guild-1',
          channelId: 'channel-1',
          messageId: 'message-2',
        },
      ],
    ]);
  });

  it('claims every game in the slate before it sends the first card', async () => {
    const trace: string[] = [];
    const discord = fakeDiscord({ trace });
    const { store, claims } = fakeStore(
      Array.from({ length: 6 }, (_, index) => game(index)),
      { trace },
    );
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toHaveLength(6);
    expect(trace.indexOf('claimCards')).toBeLessThan(trace.indexOf('channelSend'));
  });
});

describe('a slate that is already claimed', () => {
  it('sends nothing when every card row exists', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1)], { claim: () => [] });
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('already-posted');
    expect(result.games).toBe(0);
    expect(discord.channel.send).not.toHaveBeenCalled();
    expect(discord.client.channels.fetch).not.toHaveBeenCalled();
  });

  it('sends only the cards it managed to claim', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1), game(2)], {
      claim: (gameIds) => gameIds.slice(0, 2),
    });
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.games).toBe(2);
    expect(discord.channel.send).toHaveBeenCalledTimes(2);
  });
});

describe('one message per card', () => {
  it('sends each game as its own message, card above its own buttons', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1), game(2), game(3)]);
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.games).toBe(4);
    expect(discord.channel.send).toHaveBeenCalledTimes(4);
    expect(result.messageIds).toEqual(['message-1', 'message-2', 'message-3', 'message-4']);

    // The whole point of the split: one card and one action row, so Discord has
    // nothing to stack in between them.
    for (const call of discord.channel.send.mock.calls) {
      const [payload] = call as [{ embeds: unknown[]; components: unknown[] }];
      expect(payload.embeds).toHaveLength(1);
      expect(payload.components).toHaveLength(1);
    }
  });

  it('keeps the tip-off order the selection produced', async () => {
    const discord = fakeDiscord();
    const { store, attachments } = fakeStore([
      game(2),
      game(0),
      game(1, { gameDateTimeUTC: new Date('2026-10-27T23:00:00.000Z') }),
    ]);
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    expect(attachments.map((batch) => batch[0]?.gameId)).toEqual([
      '0022600121',
      '0022600120',
      '0022600122',
    ]);
  });
});

describe('a channel the bot cannot use', () => {
  it('refuses a channel that cannot receive messages', async () => {
    const discord = fakeDiscord({ sendable: false });
    const { store } = fakeStore([game(0)]);
    const poster = new SlatePoster(store, discord.infra);

    await expect(poster.post(TARGET, MORNING)).rejects.toThrow(/cannot receive messages/);
  });

  it('refuses a channel the bot cannot see', async () => {
    const { store } = fakeStore([game(0)]);
    const infra = {
      client: { channels: { fetch: async () => null } },
    } as unknown as Infrastructure;
    const poster = new SlatePoster(store, infra);

    await expect(poster.post(TARGET, MORNING)).rejects.toThrow(/not available/);
  });
});

describe('a bookkeeping failure after the send', () => {
  it('does not turn a sent message into a failed post', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0)], { attachFails: true });
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.messageIds).toEqual(['message-1']);
  });
});

describe('selection inside a post', () => {
  it('leaves out finals, started games, and other days', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([
      game(0),
      game(1, { gameStatus: 3 }),
      game(2, { gameDateTimeUTC: new Date('2026-10-27T04:30:00.000Z') }),
      game(3, { gameDate: '2026-10-26' }),
    ]);
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.games).toBe(1);
    // Only game 0 survives the filter, and the tip-off is the one field that says
    // which game the card is: 15:00 ET on the 27th, in the reader's clock.
    const [payload] = discord.channel.send.mock.calls[0] as [
      { embeds: { description?: string }[] },
    ];
    const unix = Math.floor(Date.parse('2026-10-27T23:30:00.000Z') / 1000);
    expect(payload.embeds[0].description).toContain(`<t:${unix}:f>`);
  });
});

describe('the /setup preview', () => {
  it('shows today’s cards with the buttons inert and claims nothing', async () => {
    const discord = fakeDiscord();
    const { store, claims } = fakeStore(Array.from({ length: 6 }, (_, index) => game(index)));
    const poster = new SlatePoster(store, discord.infra);

    const preview = await poster.preview(MORNING);

    expect(preview.etKey).toBe('2026-10-27');
    expect(preview.games).toBe(6);
    // Three fit in the ephemeral reply's embed budget; the count above them says 6.
    expect(preview.payloads).toHaveLength(3);
    expect(claims).toHaveLength(0);
    expect(discord.channel.send).not.toHaveBeenCalled();

    for (const payload of preview.payloads) {
      for (const row of payload.components) {
        for (const component of row.components) {
          expect(component.disabled).toBe(true);
        }
      }
    }
  });

  it('says a day with no games has nothing to post', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([]);
    const poster = new SlatePoster(store, discord.infra);

    expect(await poster.preview(MORNING)).toEqual({
      etKey: '2026-10-27',
      games: 0,
      payloads: [],
    });
  });

  it('shows every card of a short day', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1)]);
    const poster = new SlatePoster(store, discord.infra);

    const preview = await poster.preview(MORNING);

    expect(preview.payloads).toHaveLength(2);
  });
});

describe('the message shape', () => {
  it('carries a real card, not a placeholder', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0)]);
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    const [payload] = discord.channel.send.mock.calls[0] as [
      { embeds: { title?: string; description?: string }[] },
    ];
    expect(payload.embeds[0].title).toBe('BKN @ BOS');
    expect(payload.embeds[0].description).toContain('**Tip-off** <t:');
  });
});
