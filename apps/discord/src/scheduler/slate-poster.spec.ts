import { describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import type { CardTeam } from '../cards/types';
import type { Infrastructure } from './infrastructure';
import { CARDS_PER_MESSAGE, type SlateGame } from './slate';
import { SlatePoster } from './slate-poster';
import type { CardClaim, SlateStore } from './slate-store';

/**
 * Posting one day's slate, against a fake gateway and a fake store.
 *
 * The order of the three steps is the thing under test — claim the cards, send the
 * message, attach the ids — because that order is what makes a restart at 9:05
 * harmless. Everything Discord does is a fake; the real SQL is exercised by the
 * chunk's live proof.
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

interface FakeMessage {
  id: string;
  inGuild: () => boolean;
  startThread: ReturnType<typeof vi.fn>;
}

interface FakeChannel {
  id: string;
  isSendable: () => boolean;
  send: ReturnType<typeof vi.fn>;
  thread?: FakeChannel;
}

/**
 * A channel that hands back `messages` on successive sends, and opens one thread
 * if asked. `order` records what the poster did, so a test can assert the claim
 * came first.
 */
function fakeDiscord(options: { thread?: boolean; sendable?: boolean; trace?: string[] } = {}) {
  const order: string[] = options.trace ?? [];
  let counter = 0;
  const messageIds: string[] = [];

  const thread: FakeChannel = {
    id: 'thread-1',
    isSendable: () => true,
    send: vi.fn(async () => {
      counter += 1;
      const id = `thread-message-${counter}`;
      messageIds.push(id);
      return { id };
    }),
  };

  const first: FakeMessage = {
    id: 'message-1',
    inGuild: () => true,
    startThread: vi.fn(async () => {
      order.push('startThread');
      if (!options.thread) throw new Error('Missing Permissions');
      return thread;
    }),
  };

  const channel: FakeChannel = {
    id: 'channel-1',
    isSendable: () => options.sendable ?? true,
    send: vi.fn(async () => {
      order.push('channelSend');
      messageIds.unshift('message-1');
      return first;
    }),
    thread,
  };

  const client = { channels: { fetch: vi.fn(async () => channel) } };

  return {
    channel,
    first,
    thread,
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
      threadId: null,
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
      'attachCards:message-1|message-1',
    ]);
    expect(attachments).toEqual([
      [
        {
          gameId: '0022600120',
          guildId: 'guild-1',
          channelId: 'channel-1',
          messageId: 'message-1',
        },
        {
          gameId: '0022600121',
          guildId: 'guild-1',
          channelId: 'channel-1',
          messageId: 'message-1',
        },
      ],
    ]);
  });

  it('claims every game in the slate, including the ones that go to a thread', async () => {
    const discord = fakeDiscord({ thread: true });
    const { store, claims } = fakeStore(Array.from({ length: 6 }, (_, index) => game(index)));
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toHaveLength(6);
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
    const [payload] = discord.channel.send.mock.calls[0] as [{ embeds: unknown[] }];
    expect(payload.embeds).toHaveLength(2);
  });
});

describe('four cards or fewer', () => {
  it('sends one message with one embed and one action row per game', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1), game(2), game(3)]);
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.games).toBe(CARDS_PER_MESSAGE);
    expect(result.threadId).toBeNull();
    expect(discord.channel.send).toHaveBeenCalledTimes(1);

    const [payload] = discord.channel.send.mock.calls[0] as [
      { embeds: unknown[]; components: unknown[] },
    ];
    expect(payload.embeds).toHaveLength(4);
    expect(payload.components).toHaveLength(4);
    expect(discord.first.startThread).not.toHaveBeenCalled();
  });
});

describe('more than four cards', () => {
  it('threads the remainder instead of a second channel message', async () => {
    const discord = fakeDiscord({ thread: true });
    const { store, attachments } = fakeStore(Array.from({ length: 6 }, (_, index) => game(index)));
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.games).toBe(6);
    expect(result.threadId).toBe('thread-1');
    expect(result.messageIds).toEqual(['message-1', 'thread-message-1']);

    // The channel gets the first four, the thread the last two.
    expect(discord.channel.send).toHaveBeenCalledTimes(1);
    const [first] = discord.channel.send.mock.calls[0] as [{ embeds: unknown[] }];
    expect(first.embeds).toHaveLength(4);

    expect(discord.first.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ autoArchiveDuration: 1440, name: 'Slate — Oct 27' }),
    );
    expect(discord.thread.send).toHaveBeenCalledTimes(1);
    const [tail] = discord.thread.send.mock.calls[0] as [{ embeds: unknown[] }];
    expect(tail.embeds).toHaveLength(2);

    // The thread's cards are recorded against the thread, not the channel.
    expect(attachments[1].map((attachment) => attachment.channelId)).toEqual([
      'thread-1',
      'thread-1',
    ]);
  });

  it('keeps the channel post when the thread cannot be opened', async () => {
    const discord = fakeDiscord({ thread: false });
    const { store } = fakeStore(Array.from({ length: 6 }, (_, index) => game(index)));
    const poster = new SlatePoster(store, discord.infra);

    const result = await poster.post(TARGET, MORNING);

    expect(result.status).toBe('posted');
    expect(result.threadId).toBeNull();
    expect(result.messageIds).toEqual(['message-1']);
    expect(discord.thread.send).not.toHaveBeenCalled();
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
    const [payload] = discord.channel.send.mock.calls[0] as [
      { embeds: { footer?: { text?: string } }[] },
    ];
    expect(payload.embeds[0].footer?.text).toBe('IKnoBall · 0022600120');
  });
});

describe('the /setup preview', () => {
  it('shows today’s cards with the buttons inert and claims nothing', async () => {
    const discord = fakeDiscord({ thread: true });
    const { store, claims } = fakeStore(Array.from({ length: 6 }, (_, index) => game(index)));
    const poster = new SlatePoster(store, discord.infra);

    const preview = await poster.preview(MORNING);

    expect(preview.etKey).toBe('2026-10-27');
    expect(preview.games).toBe(6);
    expect(preview.threaded).toBe(2);
    expect(preview.payloads).toHaveLength(4);
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
      threaded: 0,
    });
  });

  it('does not thread a four-game day', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0), game(1), game(2), game(3)]);
    const poster = new SlatePoster(store, discord.infra);

    const preview = await poster.preview(MORNING);

    expect(preview.payloads).toHaveLength(4);
    expect(preview.threaded).toBe(0);
  });
});

describe('the message shape', () => {
  it('carries a real card, not a placeholder', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0)]);
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    const [payload] = discord.channel.send.mock.calls[0] as [
      { embeds: { title?: string; author?: { name?: string } }[] },
    ];
    expect(payload.embeds[0].author?.name).toBe('IKnoBall');
    expect(payload.embeds[0].title).toBe('BKN @ BOS');
  });
});

describe('types', () => {
  it('posts a Message the gateway would hand back', async () => {
    const discord = fakeDiscord();
    const { store } = fakeStore([game(0)]);
    const poster = new SlatePoster(store, discord.infra);

    await poster.post(TARGET, MORNING);

    const sent = discord.channel.send.mock.results[0].value as Promise<Message>;
    expect(await sent).toBe(discord.first);
  });
});
