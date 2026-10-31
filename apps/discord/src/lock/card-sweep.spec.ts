import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import type { discordCards, scheduleGames } from '@iknoball/database';
import type { CardPayload } from '../cards/card-payload';
import { CardSweep, type SweepJob, type SweepSource } from './card-sweep';
import { DiscordCardEditor } from './card-editor';
import { DeadCards } from './dead-cards';
import { messagePayload, type CardRow } from './sweep-repository';

/**
 * The sweep loop against a fake Discord and an in-memory copy of the two tables.
 *
 * The fakes are deliberately shaped like the real things:
 *
 * - **The real editor.** `DiscordCardEditor` runs against a fake gateway client, so
 *   the channel lookup, the `messages.edit` call, and the error classification are
 *   the production ones. A 403 and an `UnknownMessage` arrive the way discord.js
 *   would deliver them.
 * - **The real schema.** Card and game fixtures are `$inferSelect` rows, so a
 *   renamed column is a compile error here rather than a surprise at runtime.
 * - **The real payload builder.** `messagePayload` from the repository builds what
 *   each job sends, so the assertions are about the bytes Discord receives.
 *
 * What is faked is only the SQL: the in-memory `due` mirrors the repository's two
 * predicates. The SQL itself is exercised against the live database by the chunk's
 * live proof, which is the only place it can be.
 */

type Card = typeof discordCards.$inferSelect;
type Game = typeof scheduleGames.$inferSelect;

const NOW = new Date('2026-10-27T03:00:00.000Z');
const TIPPED_OFF = new Date('2026-10-27T02:00:00.000Z');
const LATER = new Date('2026-10-27T23:00:00.000Z');

// ---------------------------------------------------------------- fixtures

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    gameId: '0022600127',
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: '123456789012345678',
    lockedAt: null,
    settledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function game(overrides: Partial<Game> = {}): Game {
  const base: Partial<Game> = {
    id: 'game-row-1',
    gameId: '0022600127',
    gameDate: '2026-10-26',
    gameCode: '20261026/GSWDEN',
    gameStatus: 1,
    gameStatusText: '10:00 pm ET',
    gameSequence: 1,
    gameDateTimeUTC: TIPPED_OFF,
    seriesText: null,
    homeTeamId: 1610612743,
    homeTeamName: 'Nuggets',
    homeTeamCity: 'Denver',
    homeTeamTricode: 'DEN',
    homeTeamScore: null,
    awayTeamId: 1610612744,
    awayTeamName: 'Warriors',
    awayTeamCity: 'Golden State',
    awayTeamTricode: 'GSW',
    awayTeamScore: null,
    isNeutral: false,
  };

  return { ...base, ...overrides } as Game;
}

/** The join, as the repository selects it: the card, its game, and both teams. */
function row(table: Table, entry: Card): CardRow {
  const match = table.games.find((candidate) => candidate.gameId === entry.gameId);
  if (!match) throw new Error(`no game for ${entry.gameId}`);

  return {
    id: entry.id,
    gameId: entry.gameId,
    channelId: entry.channelId,
    messageId: entry.messageId,
    lockedAt: entry.lockedAt,
    settledAt: entry.settledAt,
    gameStatus: match.gameStatus,
    gameDate: match.gameDate,
    gameDateTimeUTC: match.gameDateTimeUTC,
    seasonYear: '2026-27',
    seriesText: match.seriesText,
    homeTricode: match.homeTeamTricode,
    homeCity: match.homeTeamCity,
    homeScheduleName: match.homeTeamName,
    homeScore: match.homeTeamScore,
    awayTricode: match.awayTeamTricode,
    awayCity: match.awayTeamCity,
    awayScheduleName: match.awayTeamName,
    awayScore: match.awayTeamScore,
    homeFullName: 'Denver Nuggets',
    homeAbbreviation: 'DEN',
    homeLogoUrl: null,
    awayFullName: 'Golden State Warriors',
    awayAbbreviation: 'GSW',
    awayLogoUrl: null,
  };
}

class Table {
  readonly cards: Card[] = [];
  readonly games: Game[] = [];

  add(...entries: Card[]): this {
    this.cards.push(...entries);
    return this;
  }

  addGame(...entries: Game[]): this {
    this.games.push(...entries);
    return this;
  }

  byId(cardId: string): Card {
    const found = this.cards.find((entry) => entry.id === cardId);
    if (!found) throw new Error(`no card ${cardId}`);
    return found;
  }

  /** Every card in the message, in the order the scheduler posted them. */
  siblings(entry: Card): Card[] {
    return this.cards
      .filter((other) => other.channelId === entry.channelId && other.messageId === entry.messageId)
      .sort(
        (left, right) =>
          (this.games.find((g) => g.gameId === left.gameId)?.gameDateTimeUTC?.getTime() ?? 0) -
          (this.games.find((g) => g.gameId === right.gameId)?.gameDateTimeUTC?.getTime() ?? 0),
      );
  }

  rows(entries: readonly Card[]): CardRow[] {
    return entries.map((entry) => row(this, entry));
  }
}

// ---------------------------------------------------------------- the source

type Kind = 'lock' | 'settlement';

/**
 * No standings and no prices: the sweeps under test are about which message is
 * edited and what state its cards end up in, not about the numbers on them.
 */
const NO_STATS = { form: new Map(), stakes: new Map() };

/** The two SQL predicates, in memory, plus the stamp. */
function source(table: Table, kind: Kind): SweepSource {
  return {
    name: kind,

    async due(now: Date, limit: number, excludeIds: readonly string[]): Promise<SweepJob[]> {
      const due = table.cards
        .filter((entry) => !excludeIds.includes(entry.id))
        .filter((entry) => /^\d+$/.test(entry.messageId))
        .filter((entry) => {
          const match = table.games.find((candidate) => candidate.gameId === entry.gameId);
          if (!match) return false;

          if (kind === 'lock') {
            return (
              entry.lockedAt === null &&
              entry.settledAt === null &&
              match.gameStatus !== 3 &&
              match.gameDateTimeUTC !== null &&
              match.gameDateTimeUTC.getTime() <= now.getTime()
            );
          }

          return (
            entry.settledAt === null &&
            match.gameStatus === 3 &&
            match.homeTeamScore !== null &&
            match.awayTeamScore !== null
          );
        })
        .slice(0, limit);

      const groups = new Map<string, Card[]>();
      for (const entry of due) {
        const key = `${entry.channelId}:${entry.messageId}`;
        groups.set(key, [...(groups.get(key) ?? []), entry]);
      }

      return [...groups.values()].map((group) => ({
        channelId: group[0]!.channelId,
        messageId: group[0]!.messageId,
        cardIds: group.map((entry) => entry.id),
        payload: messagePayload(table.rows(table.siblings(group[0]!)), now, NO_STATS),
      }));
    },

    async record(cardIds: readonly string[], at: Date): Promise<void> {
      for (const entry of table.cards) {
        if (!cardIds.includes(entry.id)) continue;
        if (kind === 'lock') entry.lockedAt = at;
        else entry.settledAt = at;
      }
    },
  };
}

// ---------------------------------------------------------------- the gateway

interface FakeMessage {
  id: string;
  /** Every payload Discord received for it, in order. */
  edits: CardPayload[];
  fail?: Error;
}

interface FakeChannel {
  id: string;
  messages: Map<string, FakeMessage>;
}

/** What discord.js throws: a `DiscordAPIError` with `status` and `code`. */
function apiError(status: number, code: number, message: string): Error {
  return Object.assign(new Error(message), { name: `DiscordAPIError[${code}]`, status, code });
}

function gateway(options: { ready?: boolean } = {}) {
  const channels = new Map<string, FakeChannel>();
  const fetches: string[] = [];

  const client = {
    isReady: () => options.ready ?? true,
    channels: {
      cache: new Map<string, FakeChannel>(),
      fetch: async (channelId: string) => {
        fetches.push(channelId);
        const channel = channels.get(channelId);
        if (!channel) throw apiError(404, 10003, 'Unknown Channel');

        return {
          id: channelId,
          isTextBased: () => true,
          messages: {
            edit: async (messageId: string, payload: CardPayload) => {
              const message = channel.messages.get(messageId);
              if (!message) throw apiError(404, 10008, 'Unknown Message');
              if (message.fail) throw message.fail;
              message.edits.push(payload);
            },
          },
        };
      },
    },
  };

  return {
    client: client as unknown as Client,
    channels,
    fetches,
    /** A channel with one message in it, ready to be edited. */
    add(channelId: string, messageId: string, fail?: Error) {
      const message: FakeMessage = { id: messageId, edits: [], ...(fail ? { fail } : {}) };
      channels.set(channelId, { id: channelId, messages: new Map([[messageId, message]]) });
      return message;
    },
    edits(messageId: string): CardPayload[] {
      for (const channel of channels.values()) {
        const message = channel.messages.get(messageId);
        if (message) return message.edits;
      }
      return [];
    },
  };
}

function harness(
  table: Table,
  kind: Kind,
  fake: ReturnType<typeof gateway>,
  options: { clock?: { now: Date } } = {},
) {
  const deadCards = new DeadCards();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const clock = options.clock ?? { now: NOW };

  const sweep = new CardSweep({
    source: source(table, kind),
    editor: new DiscordCardEditor(fake.client),
    deadCards,
    logger,
    now: () => clock.now,
  });

  return { sweep, deadCards, logger, clock };
}

/** The description of the nth embed of the last payload a message received. */
function description(payload: CardPayload, index = 0): string {
  return payload.embeds[index]?.description ?? '';
}

function pickButtons(payload: CardPayload, index = 0) {
  return (payload.components[index]?.components ?? []).filter(
    (component) => 'custom_id' in component,
  );
}

// ---------------------------------------------------------------- the lock

describe('the tip-off lock sweep', () => {
  it('disables a past-tip-off card and stamps lockedAt', async () => {
    const table = new Table().addGame(game()).add(card());
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({
      skipped: false,
      candidates: 1,
      messages: 1,
      edited: 1,
      dead: 0,
    });
    expect(message.edits).toHaveLength(1);
    expect(pickButtons(message.edits[0]!)).toEqual([
      expect.objectContaining({ custom_id: 'pick:0022600127:away', disabled: true }),
      expect.objectContaining({ custom_id: 'pick:0022600127:home', disabled: true }),
    ]);
    expect(description(message.edits[0]!)).toContain('🔒 **Locked at tip-off**');
    expect(table.byId('card-1').lockedAt).toEqual(NOW);
  });

  it('does not touch a card whose game has not tipped off', async () => {
    const table = new Table()
      .addGame(game({ gameDateTimeUTC: LATER }))
      .add(card({ messageId: '123456789012345678' }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report.edited).toBe(0);
    expect(message.edits).toHaveLength(0);
    expect(table.byId('card-1').lockedAt).toBeNull();
  });

  it('leaves a final game to the settlement sweep', async () => {
    // The bot was down at tip-off, so this card was never locked. Locking it now
    // would edit the message to the settled look and the settlement sweep would
    // edit it again a minute later, and one failure would mark the card dead for
    // both sweeps at once.
    const table = new Table()
      .addGame(game({ gameStatus: 3, homeTeamScore: 134, awayTeamScore: 114 }))
      .add(card({ messageId: '123456789012345678' }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 0, edited: 0 });
    expect(message.edits).toHaveLength(0);
    expect(table.byId('card-1').lockedAt).toBeNull();
  });

  it('skips a card that is already locked', async () => {
    const table = new Table()
      .addGame(game())
      .add(card({ messageId: '123456789012345678', lockedAt: TIPPED_OFF }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 0, edited: 0 });
    expect(message.edits).toHaveLength(0);
    expect(table.byId('card-1').lockedAt).toEqual(TIPPED_OFF);
  });

  it('never edits the same card twice', async () => {
    const table = new Table().addGame(game()).add(card({ messageId: '123456789012345678' }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    await sweep.run();
    const second = await sweep.run();

    expect(second).toMatchObject({ candidates: 0, edited: 0 });
    expect(message.edits).toHaveLength(1);
  });

  it('skips a card the scheduler claimed but never sent', async () => {
    // `messageId` is not a snowflake, so there is no message to edit: the row is
    // the scheduler's crash marker, not a card.
    const table = new Table().addGame(game()).add(card({ messageId: 'pending' }));
    const fake = gateway();
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 0, edited: 0, dead: 0 });
    expect(fake.fetches).toHaveLength(0);
  });

  it('rebuilds a shared message with its siblings intact', async () => {
    // Two cards in one message (the scheduler puts up to four there). The second
    // game has not tipped off, so its buttons must come back untouched.
    const table = new Table()
      .addGame(game(), game({ id: 'game-row-2', gameId: '0022600128', gameDateTimeUTC: LATER }))
      .add(
        card({ id: 'card-1', messageId: '123456789012345678' }),
        card({ id: 'card-2', gameId: '0022600128', messageId: '123456789012345678' }),
      );
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 1, messages: 1, edited: 1 });
    expect(message.edits).toHaveLength(1);

    const sent = message.edits[0]!;
    expect(sent.embeds).toHaveLength(2);
    expect(sent.embeds[1]?.title).toBe('GSW @ DEN');
    expect(pickButtons(sent, 1).every((button) => !('disabled' in button))).toBe(true);

    expect(table.byId('card-1').lockedAt).toEqual(NOW);
    expect(table.byId('card-2').lockedAt).toBeNull();
  });
});

// ---------------------------------------------------------------- failures

describe('a card that cannot be edited', () => {
  it('marks a 403 dead and carries on with its siblings', async () => {
    const table = new Table()
      .addGame(game())
      .add(
        card({ id: 'card-403', channelId: 'channel-403', messageId: '111111111111111111' }),
        card({ id: 'card-gone', channelId: 'channel-gone', messageId: '222222222222222222' }),
        card({ id: 'card-ok', channelId: 'channel-ok', messageId: '333333333333333333' }),
      );
    const fake = gateway();
    fake.add('channel-403', '111111111111111111', apiError(403, 50013, 'Missing Permissions'));
    // `channel-gone` is never registered: the fetch itself fails, as it does when
    // the bot has been removed from the guild.
    const ok = fake.add('channel-ok', '333333333333333333');
    const { sweep, deadCards, logger } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 3, messages: 1, edited: 1, dead: 2, failed: 0 });
    expect(ok.edits).toHaveLength(1);
    expect(deadCards.has('card-403')).toBe(true);
    expect(deadCards.has('card-gone')).toBe(true);
    expect(deadCards.has('card-ok')).toBe(false);
    expect(logger.warn).toHaveBeenCalled();

    // The dead ones are not retried, and the live one is already stamped.
    const second = await sweep.run();
    expect(second).toMatchObject({ candidates: 0, edited: 0, dead: 0 });
    expect(ok.edits).toHaveLength(1);
  });

  it('marks an UnknownMessage dead', async () => {
    const table = new Table()
      .addGame(game())
      .add(
        card({ id: 'card-deleted', channelId: 'channel-1', messageId: '111111111111111111' }),
        card({ id: 'card-ok', channelId: 'channel-2', messageId: '222222222222222222' }),
      );
    const fake = gateway();
    fake.add('channel-1', '111111111111111111', apiError(404, 10008, 'Unknown Message'));
    const ok = fake.add('channel-2', '222222222222222222');
    const { sweep, deadCards } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ edited: 1, dead: 1 });
    expect(deadCards.has('card-deleted')).toBe(true);
    expect(ok.edits).toHaveLength(1);
    expect(table.byId('card-deleted').lockedAt).toBeNull();
  });

  it('drops every card of a dead message, not just the one that failed', async () => {
    const table = new Table()
      .addGame(game())
      .add(
        card({ id: 'card-a', channelId: 'channel-1', messageId: '111111111111111111' }),
        card({ id: 'card-b', channelId: 'channel-1', messageId: '111111111111111111' }),
      );
    const fake = gateway();
    fake.add('channel-1', '111111111111111111', apiError(404, 10008, 'Unknown Message'));
    const { sweep, deadCards } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 2, messages: 0, edited: 0, dead: 2 });
    expect(deadCards.has('card-a')).toBe(true);
    expect(deadCards.has('card-b')).toBe(true);
  });
});

// ---------------------------------------------------------------- outage

describe('a Discord outage', () => {
  it('stops after the first transient failure and backs off instead of retrying', async () => {
    const table = new Table()
      .addGame(game())
      .add(
        card({ id: 'card-1', channelId: 'channel-1', messageId: '111111111111111111' }),
        card({ id: 'card-2', channelId: 'channel-2', messageId: '222222222222222222' }),
      );
    const fake = gateway();
    fake.add('channel-1', '111111111111111111', apiError(500, 0, 'Internal Server Error'));
    const second = fake.add('channel-2', '222222222222222222');
    const { sweep, clock } = harness(table, 'lock', fake);

    const first = await sweep.run();

    // One attempt, not one per card: the second card is never tried.
    expect(first).toMatchObject({ edited: 0, failed: 1 });
    expect(second.edits).toHaveLength(0);
    expect(table.byId('card-1').lockedAt).toBeNull();

    // The next minute is inside the backoff window: no work at all.
    clock.now = new Date(NOW.getTime() + 30_000);
    const backedOff = await sweep.run();
    expect(backedOff).toMatchObject({ skipped: true, edited: 0 });

    // Once the window passes, the sweep tries again.
    clock.now = new Date(NOW.getTime() + 61_000);
    const retried = await sweep.run();
    expect(retried).toMatchObject({ skipped: false, failed: 1 });
  });

  it('does nothing while the gateway is not ready', async () => {
    const table = new Table().addGame(game()).add(card({ messageId: '123456789012345678' }));
    const fake = gateway({ ready: false });
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ skipped: true, edited: 0 });
    expect(message.edits).toHaveLength(0);
  });

  it('never runs two sweeps at once', async () => {
    const table = new Table().addGame(game()).add(card({ messageId: '123456789012345678' }));
    const fake = gateway();
    fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'lock', fake);

    const [first, second] = await Promise.all([sweep.run(), sweep.run()]);

    expect([first.skipped, second.skipped].sort()).toEqual([false, true]);
    expect(fake.edits('123456789012345678')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- settlement

describe('the settlement sweep', () => {
  it('edits a final game to its score and stamps settledAt', async () => {
    const table = new Table()
      .addGame(game({ gameStatus: 3, homeTeamScore: 114, awayTeamScore: 134 }))
      .add(card({ messageId: '123456789012345678', lockedAt: TIPPED_OFF }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'settlement', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 1, messages: 1, edited: 1 });
    expect(description(message.edits[0]!)).toContain('**Final** GSW 134 – 114 DEN');
    expect(pickButtons(message.edits[0]!).every((button) => 'disabled' in button)).toBe(true);
    expect(table.byId('card-1').settledAt).toEqual(NOW);
  });

  it('leaves a game that is not final alone', async () => {
    const table = new Table().addGame(game({ gameStatus: 2 }));
    table.add(card({ messageId: '123456789012345678', lockedAt: TIPPED_OFF }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'settlement', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 0, edited: 0 });
    expect(message.edits).toHaveLength(0);
    expect(table.byId('card-1').settledAt).toBeNull();
  });

  it('waits for the score rather than printing a final with no result', async () => {
    const table = new Table().addGame(game({ gameStatus: 3 }));
    table.add(card({ messageId: '123456789012345678', lockedAt: TIPPED_OFF }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'settlement', fake);

    await sweep.run();

    expect(message.edits).toHaveLength(0);
    expect(table.byId('card-1').settledAt).toBeNull();
  });

  it('does not edit a settled card a second time', async () => {
    const table = new Table()
      .addGame(game({ gameStatus: 3, homeTeamScore: 114, awayTeamScore: 134 }))
      .add(card({ messageId: '123456789012345678', lockedAt: TIPPED_OFF, settledAt: TIPPED_OFF }));
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'settlement', fake);

    const report = await sweep.run();

    expect(report).toMatchObject({ candidates: 0, edited: 0 });
    expect(message.edits).toHaveLength(0);
  });

  it('shows the score on a message whose other card has only tipped off', async () => {
    const table = new Table()
      .addGame(
        game({ gameStatus: 3, homeTeamScore: 114, awayTeamScore: 134 }),
        game({ id: 'game-row-2', gameId: '0022600128', gameDateTimeUTC: TIPPED_OFF }),
      )
      .add(
        card({ id: 'card-final', messageId: '123456789012345678', lockedAt: TIPPED_OFF }),
        card({
          id: 'card-live',
          gameId: '0022600128',
          messageId: '123456789012345678',
          lockedAt: TIPPED_OFF,
        }),
      );
    const fake = gateway();
    const message = fake.add('channel-1', '123456789012345678');
    const { sweep } = harness(table, 'settlement', fake);

    await sweep.run();

    const sent = message.edits[0]!;
    expect(description(sent, 0)).toContain('**Final** GSW 134 – 114 DEN');
    expect(description(sent, 1)).toContain('🔒 **Locked at tip-off**');
    expect(description(sent, 1)).not.toContain('**Final**');
    expect(pickButtons(sent, 1).every((button) => 'disabled' in button)).toBe(true);
    // Only the final card is stamped; the sibling keeps waiting for its own result.
    expect(table.byId('card-final').settledAt).toEqual(NOW);
    expect(table.byId('card-live').settledAt).toBeNull();
  });
});
