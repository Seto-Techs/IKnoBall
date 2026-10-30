import { describe, expect, it } from 'vitest';
import { ButtonStyle, ComponentType } from 'discord.js';
import { cardPayload, type CardPayload } from '../cards/card-payload';
import type { CardGame, CardTeams } from '../cards/types';
import {
  LOCKED_LINE,
  SETTLED_LINE,
  cardLook,
  classifyEditFailure,
  finalLine,
  lockedCard,
  renderCard,
  settledCard,
  type CardState,
} from './card-edit';

/**
 * The two edits as pure functions.
 *
 * What matters here is the exact payload a PATCH will carry — which buttons lose
 * their `disabled` flag, what the description says, and what survives untouched —
 * plus the sorting of an edit failure into "never retry" and "try later". None of
 * it needs a client, a database, or a clock, which is why it is a separate spec
 * from the sweep loop.
 */

const GAME: CardGame = {
  id: '0022600127',
  awayTeam: 'Golden State Warriors',
  homeTeam: 'Denver Nuggets',
  awayTricode: 'GSW',
  homeTricode: 'DEN',
  gameDateTime: '2026-10-27T02:00:00.000Z',
  seriesText: null,
};

const TEAMS: CardTeams = {
  away: { tricode: 'GSW', name: 'Golden State Warriors', record: { wins: 3, losses: 1 } },
  home: { tricode: 'DEN', name: 'Denver Nuggets', record: { wins: 2, losses: 2 } },
};

const SCORE = { awayTricode: 'GSW', homeTricode: 'DEN', awayScore: 134, homeScore: 114 };

function payload(): CardPayload {
  return cardPayload(GAME, TEAMS);
}

function description(card: CardPayload): string {
  return card.embeds[0]?.description ?? '';
}

/** The three buttons of a card's action row, by label. */
function buttons(card: CardPayload) {
  const row = card.components[0];
  return row?.components ?? [];
}

function cardState(overrides: Partial<CardState> = {}): CardState {
  return {
    gameStatus: 1,
    gameDateTimeUTC: new Date(GAME.gameDateTime),
    homeScore: null,
    awayScore: null,
    lockedAt: null,
    settledAt: null,
    homeTricode: 'DEN',
    awayTricode: 'GSW',
    ...overrides,
  };
}

const TIP_OFF = new Date(GAME.gameDateTime);
const BEFORE = new Date(TIP_OFF.getTime() - 60_000);
const AFTER = new Date(TIP_OFF.getTime() + 60_000);

describe('the tip-off lock', () => {
  it('disables both pick buttons and keeps the link button alone', () => {
    const locked = lockedCard(payload());
    const [away, home, link] = buttons(locked);

    expect(away).toMatchObject({ custom_id: 'pick:0022600127:away', disabled: true });
    expect(home).toMatchObject({ custom_id: 'pick:0022600127:home', disabled: true });
    // Discord has no disabled state for a link button, and the card stays useful.
    expect(link).toMatchObject({ style: ButtonStyle.Link, url: expect.any(String) });
    expect(link).not.toHaveProperty('disabled');
  });

  it('adds the locked line under the tip-off it already showed', () => {
    const locked = lockedCard(payload());
    const text = description(locked);

    expect(text).toContain('**Tip-off** <t:');
    expect(text.endsWith(LOCKED_LINE)).toBe(true);
    expect(text.split('\n')).toHaveLength(2);
  });

  it('changes nothing else about the card', () => {
    const original = payload();
    const locked = lockedCard(original);

    expect(locked.embeds[0]).toMatchObject({
      author: { name: 'IKnoBall' },
      title: 'GSW @ DEN',
      footer: { text: 'IKnoBall · 0022600127' },
      fields: original.embeds[0]?.fields,
    });
    expect(locked.embeds[0]?.timestamp).toBe(original.embeds[0]?.timestamp);
    expect(locked.components[0]?.type).toBe(ComponentType.ActionRow);
  });
});

describe('the result edit', () => {
  it('prints the final score, away first, and says it settled', () => {
    const text = description(settledCard(payload(), SCORE));

    expect(text).toContain('**Final** GSW 134 – 114 DEN');
    expect(text.endsWith(SETTLED_LINE)).toBe(true);
    // The tip-off stays: the card is a record of the game, not just the result.
    expect(text).toContain('**Tip-off** <t:');
  });

  it('keeps the buttons, disabled, rather than deleting the card', () => {
    const settled = settledCard(payload(), SCORE);

    expect(buttons(settled)[0]).toMatchObject({ disabled: true });
    expect(buttons(settled)[1]).toMatchObject({ disabled: true });
    expect(settled.embeds).toHaveLength(1);
  });

  it('formats the score line the way the embed reads it', () => {
    expect(finalLine(SCORE)).toBe('**Final** GSW 134 – 114 DEN');
  });
});

describe('which look a card has', () => {
  it('is open before tip-off', () => {
    expect(cardLook(cardState(), BEFORE)).toBe('open');
  });

  it('is locked at tip-off even before the sweep has stamped it', () => {
    expect(cardLook(cardState(), TIP_OFF)).toBe('locked');
    expect(cardLook(cardState(), AFTER)).toBe('locked');
  });

  it('stays locked once stamped, whatever the clock says', () => {
    expect(cardLook(cardState({ lockedAt: AFTER }), BEFORE)).toBe('locked');
  });

  it('is settled only for a final game that has a score', () => {
    expect(cardLook(cardState({ gameStatus: 3, homeScore: 114, awayScore: 134 }), AFTER)).toBe(
      'settled',
    );
    // A final row with no result is not a result: it stays locked, not settled.
    expect(cardLook(cardState({ gameStatus: 3 }), AFTER)).toBe('locked');
  });

  it('renders an open card unchanged, by identity', () => {
    const original = payload();
    expect(renderCard(original, cardState(), BEFORE)).toBe(original);
  });

  it('renders a settled card from the state alone, with no stamp needed', () => {
    const settled = renderCard(
      payload(),
      cardState({ gameStatus: 3, homeScore: 114, awayScore: 134 }),
      AFTER,
    );

    expect(description(settled)).toContain('**Final** GSW 134 – 114 DEN');
  });
});

describe('sorting an edit failure', () => {
  /** What discord.js throws: a `DiscordAPIError` with `status` and `code`. */
  function apiError(status: number, code: number, message = 'nope'): Error {
    return Object.assign(new Error(message), { name: 'DiscordAPIError[10008]', status, code });
  }

  it('treats 403 and 404 as dead, whatever the code', () => {
    expect(classifyEditFailure(apiError(403, 50013, 'Missing Permissions'))).toBe('dead');
    expect(classifyEditFailure(apiError(404, 10008, 'Unknown Message'))).toBe('dead');
    expect(classifyEditFailure(apiError(404, 10003, 'Unknown Channel'))).toBe('dead');
  });

  it('treats the unknown-resource codes as dead even without a status', () => {
    expect(classifyEditFailure({ code: 10008 })).toBe('dead');
    expect(classifyEditFailure({ code: 10003 })).toBe('dead');
    expect(classifyEditFailure({ rawError: { code: 50001 } })).toBe('dead');
  });

  it('treats a server error, a rate limit, and a socket reset as transient', () => {
    expect(classifyEditFailure(apiError(500, 0, 'Internal Server Error'))).toBe('transient');
    expect(classifyEditFailure(apiError(429, 0, 'You are being rate limited'))).toBe('transient');
    expect(classifyEditFailure(new Error('socket hang up'))).toBe('transient');
    expect(classifyEditFailure('nope')).toBe('transient');
  });
});
