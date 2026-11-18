import { describe, expect, it } from 'vitest';
import {
  CARD_WIDTH,
  MAX_ROWS,
  cardHeight,
  gradeLabel,
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

describe('cardHeight', () => {
  it('grows by one row per player', () => {
    expect(cardHeight(2) - cardHeight(1)).toBe(cardHeight(1) - cardHeight(0));
  });

  it('stops growing at the five-row cut', () => {
    expect(cardHeight(MAX_ROWS)).toBe(cardHeight(MAX_ROWS + 3));
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
    expect((await pngMetadata(seven)).height).toBe(cardHeight(MAX_ROWS));
  }, 30_000);
});

/** Width, height, and format without pulling sharp in at the top of the file. */
async function pngMetadata(png: Buffer) {
  const { default: sharp } = await import('sharp');
  const { width, height, format } = await sharp(png).metadata();
  return { width, height, format };
}
