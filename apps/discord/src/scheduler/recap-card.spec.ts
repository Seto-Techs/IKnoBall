import { describe, expect, it } from 'vitest';
import {
  CARD_WIDTH,
  MAX_ROWS,
  cardHeight,
  gradeLabel,
  recapField,
  renderRecapCard,
  type RecapCard,
  type RecapRow,
} from './recap-card';

/**
 * The recap card's numbers and its render.
 *
 * The blocks come straight from the stored result, so the only thing derived here is
 * the words beside them — and those are the one place the card can quietly disagree
 * with the activity, which writes "Off by N" from the same grade.
 *
 * The render is pinned only as far as it can be pinned without pinning pixels: the
 * width, the height for a given row count, and the five-row cut. A layout change should
 * not have to rewrite this file; a change to how many rows are drawn should.
 */

function row(name: string, blocks: number): RecapRow {
  return { name, players: 6 - blocks, blocks, avatar: null };
}

function card(rows: RecapRow[], par = 2): RecapCard {
  return {
    day: 'Thu 12 Nov',
    par,
    played: rows.length,
    rows,
    yesterday: { from: { name: 'A', headshot: null }, to: { name: 'B', headshot: null } },
    today: { from: { name: 'C', headshot: null }, to: { name: 'D', headshot: null } },
    pitch: 'Fewest hops wins.',
  };
}

describe('gradeLabel', () => {
  it('says Par on a full five', () => {
    expect(gradeLabel(5)).toBe('Par');
  });

  it('counts the blocks the player is missing', () => {
    expect(gradeLabel(4)).toBe('Off by 1');
    expect(gradeLabel(2)).toBe('Off by 3');
  });

  it('caps the wording at three, because the blocks have already said the rest', () => {
    // One block is the floor the game can award, so "Off by 4" is the shortest grade
    // and everything longer reads the same.
    expect(gradeLabel(1)).toBe('Off by 3+');
  });
});

describe('recapField', () => {
  const entry = (i: number, blocks = 5) => ({
    name: `Player ${i}`,
    players: 3,
    blocks,
    discordUserId: `d${i}`,
  });

  it('lists rows as mentions, with the grade words the card draws', () => {
    const value = recapField({ day: 'Mon 23 Nov', played: 2, rows: [entry(1), entry(2, 4)] });

    expect(value).toBe('1. <@d1> · 3 players · Par\n2. <@d2> · 3 players · Off by 1');
  });

  it('counts the players the cut leaves out, not everyone who played', () => {
    const rows = Array.from({ length: 7 }, (_, i) => entry(i + 1));
    const lines = recapField({ day: 'Mon 23 Nov', played: 7, rows }).split('\n');

    expect(lines).toHaveLength(MAX_ROWS + 1);
    expect(lines.at(-1)).toBe('*+ 2 others played*');
    // Numbering follows the rows drawn, so a cut board never reads "1..7".
    expect(lines.join('\n')).not.toContain('6.');
  });

  it('drops the plural for a single player and a single other', () => {
    const rows = [
      { ...entry(1), players: 1 },
      ...Array.from({ length: 4 }, (_, i) => entry(i + 2)),
    ];
    const lines = recapField({ day: 'Mon 23 Nov', played: 6, rows }).split('\n');

    expect(lines[0]).toBe('1. <@d1> · 1 player · Par');
    expect(lines.at(-1)).toBe('*+ 1 other played*');
  });

  it('says nothing extra when the cut showed everybody', () => {
    const rows = Array.from({ length: MAX_ROWS }, (_, i) => entry(i + 1));
    const lines = recapField({ day: 'Mon 23 Nov', played: MAX_ROWS, rows }).split('\n');

    expect(lines).toHaveLength(MAX_ROWS);
  });

  it('says so on a day nobody played, instead of leaving a blank field', () => {
    expect(recapField({ day: 'Mon 23 Nov', played: 0, rows: [] })).toBe(
      '*Nobody in this server played this one.*',
    );
  });
});

describe('cardHeight', () => {
  it('grows by one row per player above the floor', () => {
    expect(cardHeight(3) - cardHeight(2)).toBe(cardHeight(2) - cardHeight(1));
  });

  it('stops growing at the five-row cut', () => {
    expect(cardHeight(MAX_ROWS)).toBe(cardHeight(MAX_ROWS + 3));
  });

  it('reserves a line for the players the cut left out', () => {
    expect(cardHeight(MAX_ROWS, true) - cardHeight(MAX_ROWS, false)).toBeGreaterThan(0);
  });

  it('keeps a body on a day nobody played, so the footer is not on top of the text', () => {
    // Zero rows still gets one row's worth: the "nobody played" line lives there.
    expect(cardHeight(0)).toBe(cardHeight(1));
  });
});

describe('renderRecapCard', () => {
  it('renders a PNG at the phone-first width', async () => {
    const png = await renderRecapCard(card([row('QA Five', 4)]));
    const meta = await pngMetadata(png);

    expect(meta.format).toBe('png');
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(cardHeight(1));
  }, 30_000);

  it('draws five rows of five, not the whole server', async () => {
    const five = await renderRecapCard(card([1, 2, 3, 4, 5].map((n) => row(`P${n}`, 4))));
    const seven = await renderRecapCard(card([1, 2, 3, 4, 5, 6, 7].map((n) => row(`P${n}`, 4))));

    expect((await pngMetadata(five)).height).toBe(cardHeight(MAX_ROWS));
    // Seven played, five drawn: same five rows, plus the line naming the other two.
    expect((await pngMetadata(seven)).height).toBe(cardHeight(MAX_ROWS, true));
  }, 30_000);

  it('makes room for the cut line when more players played than are drawn', async () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(`P${n}`, 4));
    const exact = await renderRecapCard(card(rows));
    const cut = await renderRecapCard({ ...card(rows), played: 9 });

    expect((await pngMetadata(exact)).height).toBe(cardHeight(MAX_ROWS, false));
    expect((await pngMetadata(cut)).height).toBe(cardHeight(MAX_ROWS, true));
  }, 30_000);

  it('still draws a card on a day nobody played, with no par to print', async () => {
    const png = await renderRecapCard({ ...card([]), par: null, played: 0 });
    const meta = await pngMetadata(png);

    expect(meta.format).toBe('png');
    expect(meta.width).toBe(CARD_WIDTH);
    // A body is reserved for the "nobody played" line (see the `cardHeight` case), so the
    // footer is not drawn on top of it.
    expect(meta.height).toBe(cardHeight(0));
  }, 30_000);

  it('draws the day without a footer when the next puzzle is not published yet', async () => {
    // The midnight case: results are in, but today's puzzle row is written on the first
    // request for it, so at 00:43 ET there is no footer to draw. This used to drop the
    // whole card — on exactly the night the board was scheduled for.
    const rows = [1, 2, 3].map((n) => row(`P${n}`, 4));
    const png = await renderRecapCard({ ...card(rows), played: 3, today: null });
    const meta = await pngMetadata(png);

    expect(meta.format).toBe('png');
    expect(meta.height).toBe(cardHeight(rows.length, false, false));
    // The footer is what is missing, not the body.
    expect(meta.height).toBeLessThan(cardHeight(rows.length));
  }, 30_000);
});

/** Width, height, and format without pulling sharp in at the top of the file. */
async function pngMetadata(png: Buffer) {
  const { default: sharp } = await import('sharp');
  const { width, height, format } = await sharp(png).metadata();
  return { width, height, format };
}
