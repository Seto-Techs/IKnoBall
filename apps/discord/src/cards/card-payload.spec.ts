import { describe, expect, it } from 'vitest';
import { ButtonStyle, ComponentType } from 'discord.js';
import { cardPayload, emojiMark } from './card-payload';
import type { CardGame, CardTeams } from './types';

/**
 * A real schedule row (`0022601194`, MEM @ DAL, 2027-04-12T00:30:00Z) with the
 * records the web card shows. Pinning the payload against real data keeps the
 * snapshot honest: nothing here is shaped to make the output pretty.
 */
const game: CardGame = {
  id: '0022601194',
  awayTeam: 'Grizzlies',
  homeTeam: 'Mavericks',
  awayTricode: 'MEM',
  homeTricode: 'DAL',
  gameDateTime: '2027-04-12T00:30:00.000Z',
  seriesText: null,
};

const teams: CardTeams = {
  away: {
    tricode: 'MEM',
    name: 'Memphis Grizzlies',
    logoUrl: 'https://cdn.nba.com/logos/nba/1610612763/global/L/logo.svg',
    record: { wins: 34, losses: 27, form: ['W', 'L', 'W', 'W', 'L', 'W'] },
    points: 26,
  },
  home: {
    tricode: 'DAL',
    name: 'Dallas Mavericks',
    logoUrl: 'https://cdn.nba.com/logos/nba/1610612742/global/L/logo.svg',
    record: { wins: 42, losses: 19, form: ['L', 'L', 'W', 'W', 'W'] },
    points: 8,
  },
};

const TIP_OFF_UNIX = Math.floor(Date.parse(game.gameDateTime) / 1000);

/**
 * Fixed ids, not the generated map: `team-emojis.ts` is rewritten by the upload
 * script, so a snapshot taken against it would change every time the emojis are
 * re-uploaded. The map that ships is checked for shape by `team-emojis.spec.ts`.
 */
const FIXTURE_EMOJIS = { MEM: '111111111111111111', DAL: '222222222222222222' };

/** What the map looks like before `build-team-emojis.ts` has ever run. */
const NO_EMOJIS = { MEM: null, DAL: null };

describe('cardPayload', () => {
  it('pins the whole payload for a real game', () => {
    expect(cardPayload(game, teams, { emojis: FIXTURE_EMOJIS })).toMatchSnapshot();
  });

  it('renders the tip-off for the reader, not for the server', () => {
    const [embed] = cardPayload(game, teams).embeds;

    // `<t:…:f>` is the reader's clock, `<t:…:R>` the countdown; Discord resolves
    // both client-side, which is why no timezone is baked in here.
    expect(embed.description).toBe(`**Tip-off** <t:${TIP_OFF_UNIX}:f> · <t:${TIP_OFF_UNIX}:R>`);
    expect(embed.timestamp).toBe('2027-04-12T00:30:00.000Z');
  });

  it('wires three buttons to the ids the router dispatches on', () => {
    const [row] = cardPayload(game, teams).components;
    const [away, home, link] = row.components;

    expect(row.type).toBe(ComponentType.ActionRow);
    expect(row.components).toHaveLength(3);
    expect(away).toMatchObject({
      style: ButtonStyle.Primary,
      custom_id: 'pick:0022601194:away',
      label: 'MEM',
    });
    expect(home).toMatchObject({
      style: ButtonStyle.Primary,
      custom_id: 'pick:0022601194:home',
      label: 'DAL',
    });
    // A link button carries no custom_id: Discord never sends it back to us.
    expect(link).not.toHaveProperty('custom_id');
    expect(link.style).toBe(ButtonStyle.Link);
    expect('url' in link && link.url).toBe('https://iknoball.setotechs.com/game/0022601194');
    expect('label' in link && link.label).toBe('Open on web');
  });

  it('renders label-only buttons and bare field names before the emojis are uploaded', () => {
    const [row] = cardPayload(game, teams, { emojis: NO_EMOJIS }).components;
    const [embed] = cardPayload(game, teams, { emojis: NO_EMOJIS }).embeds;

    for (const button of row.components.slice(0, 2)) {
      expect(button).not.toHaveProperty('emoji');
    }
    expect(row.components[0]).toMatchObject({ label: 'MEM' });
    expect(row.components[1]).toMatchObject({ label: 'DAL' });
    expect(embed.fields?.map((field) => field.name)).toEqual(['MEM · 34-27', 'DAL · 42-19']);
  });

  it('puts the team marks in the fields and buttons once the ids exist', () => {
    const emojis = FIXTURE_EMOJIS;
    const { embeds, components } = cardPayload(game, teams, { emojis });

    expect(components[0].components[0]).toMatchObject({
      label: 'MEM',
      emoji: { id: '111111111111111111', name: 'MEM' },
    });
    expect(embeds[0].fields?.map((field) => field.name)).toEqual([
      '<:MEM:111111111111111111> MEM · 34-27',
      '<:DAL:222222222222222222> DAL · 42-19',
    ]);
    // Every field is inline, so the pair sits side by side like the web card.
    expect(embeds[0].fields?.map((field) => field.inline)).toEqual([true, true]);
  });

  it('spends no space on an author line, a thumbnail, or a footer', () => {
    const [embed] = cardPayload(game, teams).embeds;

    // Each of those pushes the 432px body wide enough to wrap the tip-off line.
    expect(embed.author).toBeUndefined();
    expect(embed.thumbnail).toBeUndefined();
    expect(embed.footer).toBeUndefined();
    expect(embed.title).toBe('MEM @ DAL');
  });

  it('carries the season record, the last five, and what the pick pays', () => {
    const [embed] = cardPayload(game, teams).embeds;

    // MEM is 6-0 in the fixture's form; only the last five are shown.
    expect(embed.fields?.map((field) => field.value)).toEqual([
      'W L W W L\n**+26 pts**',
      'L L W W W\n**+8 pts**',
    ]);
  });

  it('says — for a side with a record but no form or price', () => {
    const [embed] = cardPayload(
      game,
      {
        away: { tricode: 'MEM', name: 'Memphis Grizzlies', record: { wins: 0, losses: 0 } },
        home: { tricode: 'DAL', name: 'Dallas Mavericks' },
      },
      { emojis: FIXTURE_EMOJIS },
    ).embeds;

    expect(embed.fields?.map((field) => field.name)).toEqual([
      '<:MEM:111111111111111111> MEM · 0-0',
    ]);
    expect(embed.fields?.[0].value).toBe('—');
  });

  it('shows the price alone when the feed has no record yet', () => {
    const [embed] = cardPayload(
      game,
      {
        away: { tricode: 'MEM', name: 'Memphis Grizzlies', points: 26 },
        home: { tricode: 'DAL', name: 'Dallas Mavericks', points: 8 },
      },
      { emojis: FIXTURE_EMOJIS },
    ).embeds;

    expect(embed.fields?.map((field) => field.name)).toEqual([
      '<:MEM:111111111111111111> MEM',
      '<:DAL:222222222222222222> DAL',
    ]);
    expect(embed.fields?.map((field) => field.value)).toEqual(['**+26 pts**', '**+8 pts**']);
  });

  it('drops the side that has neither a record nor a price', () => {
    const [embed] = cardPayload(
      game,
      { ...teams, away: { tricode: 'MEM', name: 'Memphis Grizzlies' } },
      { emojis: FIXTURE_EMOJIS },
    ).embeds;

    expect(embed.fields).toHaveLength(1);
    expect(embed.fields?.[0].name).toBe('<:DAL:222222222222222222> DAL · 42-19');
  });

  it('keeps the matchup in the description when no side has anything to show', () => {
    const [embed] = cardPayload(
      game,
      {
        away: { tricode: 'MEM', name: 'Memphis Grizzlies' },
        home: { tricode: 'DAL', name: 'Dallas Mavericks' },
      },
      { emojis: FIXTURE_EMOJIS },
    ).embeds;

    expect(embed.fields).toBeUndefined();
    expect(embed.description?.split('\n')[0]).toBe(
      '<:MEM:111111111111111111> **MEM** @ **DAL** <:DAL:222222222222222222>',
    );
  });

  it('says TBD rather than rendering an unparseable tip-off', () => {
    const [embed] = cardPayload({ ...game, gameDateTime: 'not a date' }, teams).embeds;

    expect(embed.description).toBe('**Tip-off** TBD');
    expect(embed.timestamp).toBeUndefined();
  });

  it('takes the web origin from its options so staging does not link to production', () => {
    const [row] = cardPayload(game, teams, {
      webBaseUrl: 'https://staging.example.com',
    }).components;
    const link = row.components[2];

    expect('url' in link && link.url).toBe('https://staging.example.com/game/0022601194');
  });

  it('adds the series line when the game has one', () => {
    const [embed] = cardPayload({ ...game, seriesText: 'DAL leads 2-1' }, teams).embeds;

    expect(embed.description?.split('\n')).toEqual([
      `**Tip-off** <t:${TIP_OFF_UNIX}:f> · <t:${TIP_OFF_UNIX}:R>`,
      '*DAL leads 2-1*',
    ]);
  });
});

describe('emojiMark', () => {
  it('is undefined for a team with no uploaded emoji', () => {
    expect(emojiMark('MEM', { MEM: null })).toBeUndefined();
    expect(emojiMark('MEM', {})).toBeUndefined();
    expect(emojiMark(null)).toBeUndefined();
  });

  it('builds the markup Discord resolves to the application emoji', () => {
    expect(emojiMark('MEM', { MEM: '123456789012345678' })).toBe('<:MEM:123456789012345678>');
  });
});
