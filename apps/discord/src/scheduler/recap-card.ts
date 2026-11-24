import './recap-fonts';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { who } from '../leaderboard/leaderboard.embed';
import { FONT_FAMILIES } from './recap-fonts';

/**
 * The Lebronnect recap card: the day's Wordle-style board, as one PNG.
 *
 * Why an image and not an embed with squares: the result a player wants to compare is a
 * row — their avatar, their chain length, their five blocks — and Discord has no way to
 * put an avatar beside text in an embed. An image also survives being screenshotted and
 * shared, which is the whole point of a daily game.
 *
 * **600px, not 800.** Discord scales an embed image to the message width, so on a phone
 * the card is about 330px wide whatever it was rendered at. At 800 the row text fell to
 * ~8px effective and was unreadable; at 600 it lands near 11px. The layout is therefore
 * designed at the size it is actually read, not at a comfortable desktop size.
 *
 * Sharp + one SVG string, which is the same shape `sharp` already takes elsewhere in
 * this image, and it keeps the render dependency-free: no headless browser, no canvas
 * build. The catch is text, which libvips draws through fontconfig — see
 * `recap-fonts.ts` for why the first import line is load-bearing.
 *
 * Pure: buffers in, PNG out. No database, no HTTP, no clock, so the layout can be
 * rendered in a test and looked at.
 */

const BG = '#FCF3DC';
const INK = '#20201E';
const NAVY = '#1C4188';
const MUTED = '#6E675C';
const LINE = '#E4DED4';
const EMPTY_BLOCK = '#C9C2B6';

/** The activity's own grade tones (`apps/activity/src/components/connect/parts.tsx`). */
const TONES: Record<number, string> = {
  5: '#FDB927',
  4: '#E05E36',
  3: '#8C301B',
  2: '#882233',
  1: '#5B5B57',
};

/** Card width. See the header: this is chosen for a phone, not a monitor. */
export const CARD_WIDTH = 600;
const PAD = 32;
const ROW_H = 62;
/** The board's cut. A recap is a top five, like Wordle's share grid is not a full list. */
export const MAX_ROWS = 5;
const HEADER_H = 88;
const FOOTER_H = 132;

export interface RecapRow {
  name: string;
  /** Intermediaries the player named, which is what the row's subtitle says. */
  players: number;
  /**
   * The grade frozen on the result when it was written — 5 at par, one fewer per hop
   * over. Read from `mini_game_results.blocks` rather than recomputed from
   * `players`/`par`, because the activity draws that same stored column: a card that
   * derived its own would be a second copy of the rule, free to drift.
   */
  blocks: number;
  /** The player's Discord avatar, already fetched. Null draws initials instead. */
  avatar: Buffer | null;
}

export interface RecapPlayer {
  name: string;
  /** NBA headshot, already fetched. Null draws initials instead. */
  headshot: Buffer | null;
}

export interface RecapCard {
  /** The day the rows are for, as it should read on the card. */
  day: string;
  /** Intermediaries on the shortest route, frozen on the rows when they were solved. */
  par: number;
  /** Already ordered: closest to par first, then earliest submitted. Capped here. */
  rows: RecapRow[];
  /** How many played, which may exceed the rows shown. */
  played: number;
  /** The pair the rows are results for. */
  yesterday: { from: RecapPlayer; to: RecapPlayer };
  /** The pair today's puzzle is about. */
  today: { from: RecapPlayer; to: RecapPlayer };
  /** The line that sells today's puzzle. */
  pitch: string;
}

/**
 * `Par` / `Off by 2` / `Off by 3+` — `gradeLabel()` in the activity's parts.tsx, which
 * takes the same words from `players - par`. Derived from the blocks here because the
 * blocks are what the card already has: five is par, so every missing block is one hop.
 */
export function gradeLabel(blocks: number): string {
  const over = 5 - blocks;
  if (over <= 0) return 'Par';
  return over > 3 ? 'Off by 3+' : `Off by ${over}`;
}

/** The line under the rows that says how many players the cut left out. */
const OVERFLOW_H = 22;

/**
 * Card height for a given row count, so callers can sanity-check a render.
 *
 * `overflow` is whether a "+ N other players" line is drawn under the rows, which
 * adds one line's worth of height. It is a parameter rather than derived from
 * `rowCount`, because the cut hides the difference: five rows and nine players is
 * still five rows.
 */
export function cardHeight(rowCount: number, overflow = false): number {
  const shown = Math.min(rowCount, MAX_ROWS);
  return PAD + HEADER_H + 16 + shown * ROW_H + 18 + (overflow ? OVERFLOW_H : 0) + FOOTER_H;
}

/** One row of the recap, as the embed field needs it — the card's rows, minus pictures. */
export interface RecapFieldRow {
  name: string;
  players: number;
  blocks: number;
  discordUserId: string;
}

export interface RecapFieldInput {
  /** The day the rows are for, as it should read: `Mon 23 Nov`. */
  day: string;
  /** How many played, which may exceed the rows listed. */
  played: number;
  rows: readonly RecapFieldRow[];
}

/**
 * The Lebronnect half of the recap embed, as text: five numbered rows, then how many
 * players the cut left out.
 *
 * The same five rows the card draws, in the same order, with the same grade words —
 * `renderRecapCard` and this read one day object, so the picture and the text cannot
 * disagree. Text as well as a picture because a card is a PNG: unsearchable,
 * unreadable to a screen reader, and gone if the render fails. This field is built
 * before any image is fetched, so that failure costs the picture only.
 */
export function recapField(recap: RecapFieldInput): string {
  const rows = recap.rows.slice(0, MAX_ROWS);
  const lines = rows.map(
    (row, index) =>
      `${index + 1}. ${who(row)} · ${row.players} ${row.players === 1 ? 'player' : 'players'} · ${gradeLabel(row.blocks)}`,
  );

  const others = recap.played - rows.length;
  if (others > 0) lines.push(`*+ ${others} ${others === 1 ? 'other' : 'others'} played*`);

  return lines.join('\n');
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A display name safe to draw.
 *
 * Poppins has no pictographs, so an emoji in a Discord display name renders as a box.
 * Dropping them keeps the row readable; the letters either side are what identifies the
 * player. Combining marks are kept — `Jokić` and `Dončić` need them.
 */
function drawable(name: string): string {
  const cleaned = name
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{So}\p{Cs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Player';
}

/** Up to two letters, for the circle drawn when there is no picture. */
function initials(name: string): string {
  const words = drawable(name).split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

let uid = 0;
/** A circular image, or a circle with initials when there is nothing to draw. */
function circle(image: Buffer | null, name: string, cx: number, cy: number, r: number): string {
  if (!image) {
    return [
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${NAVY}"/>`,
      `<text x="${cx}" y="${cy + r * 0.34}" text-anchor="middle" font-family="${FONT_FAMILIES.semibold}" font-size="${(r * 0.9).toFixed(1)}" fill="${BG}">${esc(initials(name))}</text>`,
    ].join('');
  }

  const id = `c${(uid += 1)}`;
  return [
    `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>`,
    `<image href="data:image/png;base64,${image.toString('base64')}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`,
  ].join('');
}

const measureCache = new Map<string, number>();
/**
 * Real ink width of a string, measured once and scaled.
 *
 * Font metrics are linear in size, so one 100px render answers every size. The footer
 * needs this: it has to fit two names plus two headshots plus an arrow across the card,
 * and name lengths vary from `mira` to `Shai Gilgeous-Alexander`. A guessed advance
 * misplaces the arrow and overflows the right edge.
 */
async function textWidth(text: string, family: string, size: number): Promise<number> {
  const key = `${family}|${text}`;
  let at100 = measureCache.get(key);
  if (at100 === undefined) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="220"><text x="40" y="160" font-family="${family}" font-size="100" fill="#000">${esc(text)}</text></svg>`;
    const { info } = await sharp(Buffer.from(svg))
      .trim({ threshold: 10 })
      .png()
      .toBuffer({ resolveWithObject: true });
    at100 = info.width;
    measureCache.set(key, at100);
  }
  return (at100 * size) / 100;
}

/** The shipped ink wordmark, whose O is the ball, so there is no separate mark. */
async function wordmark(): Promise<string> {
  const svg = await readFile(
    join(__dirname, '..', '..', 'assets', 'brand', 'iknoball-ink.svg'),
    'utf8',
  );
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/** Two players joined by an arrow: the chain, as a picture. */
function pair(
  from: RecapPlayer,
  to: RecapPlayer,
  y: number,
  r: number,
  nameSize: number,
  widths: { a: number; b: number },
): string {
  const nameGap = 12;
  const arrow = 34;
  const aCx = PAD + r;
  const aNameX = PAD + 2 * r + nameGap;
  const bCx = aNameX + widths.a + arrow + r;
  const bNameX = bCx + r + nameGap;
  const arrowStart = aNameX + widths.a + 9;
  const arrowEnd = bCx - r - 9;
  const baseline = y + nameSize * 0.36;

  return [
    circle(from.headshot, from.name, aCx, y, r),
    circle(to.headshot, to.name, bCx, y, r),
    `<text x="${aNameX}" y="${baseline}" font-family="${FONT_FAMILIES.condensed}" font-size="${nameSize}" fill="${NAVY}">${esc(drawable(from.name))}</text>`,
    `<text x="${bNameX}" y="${baseline}" font-family="${FONT_FAMILIES.condensed}" font-size="${nameSize}" fill="${NAVY}">${esc(drawable(to.name))}</text>`,
    `<path d="M${arrowStart} ${y} H${arrowEnd - 5}" stroke="${MUTED}" stroke-width="2"/>`,
    `<path d="M${arrowEnd - 8} ${y - 4} l6 4 l-6 4" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

/** The largest size at which both footer names still fit the card. */
async function fitNames(
  from: string,
  to: string,
): Promise<{ size: number; widths: { a: number; b: number } }> {
  const r = 19;
  const nameGap = 12;
  const arrow = 34;
  const avail = CARD_WIDTH - 2 * PAD;
  const fixed = 2 * (2 * r + nameGap) + arrow;

  let size = 30;
  let a = await textWidth(drawable(from), FONT_FAMILIES.condensed, size);
  let b = await textWidth(drawable(to), FONT_FAMILIES.condensed, size);
  while (fixed + a + b > avail && size > 16) {
    size -= 1;
    a = await textWidth(drawable(from), FONT_FAMILIES.condensed, size);
    b = await textWidth(drawable(to), FONT_FAMILIES.condensed, size);
  }
  return { size, widths: { a, b } };
}

/** Render the card. Throws only if sharp or the fonts are unusable. */
export async function renderRecapCard(card: RecapCard): Promise<Buffer> {
  const shown = card.rows.slice(0, MAX_ROWS);
  // The cut, on the card as well as in the field: the header already says how many
  // played, but five rows over nine players reads as a bug unless it is spelled out.
  const others = card.played - shown.length;
  const rowsTop = PAD + HEADER_H + 16;
  const footerTop = rowsTop + shown.length * ROW_H + 18 + (others > 0 ? OVERFLOW_H : 0);
  const height = cardHeight(shown.length, others > 0);
  const parts: string[] = [];

  // ── Header: the wordmark left, yesterday's pair right ──
  // The wordmark's viewBox starts at (-34,-14); the translate cancels that before the
  // scale, so the glyphs sit exactly at PAD.
  const wordH = 44;
  parts.push(
    `<g transform="translate(${PAD} ${PAD - 6}) scale(${(wordH / 128).toFixed(5)}) translate(34 14)">${await wordmark()}</g>`,
  );
  const played = card.played === 1 ? '1 played' : `${card.played} played`;
  parts.push(
    `<text x="${PAD + 2}" y="${PAD + 46}" font-family="${FONT_FAMILIES.medium}" font-size="13" fill="${MUTED}">Lebronnect daily recap \u00b7 ${esc(card.day)} \u00b7 par ${card.par} \u00b7 ${played}</text>`,
  );

  const R = 27;
  const arrowW = 30;
  const bCx = CARD_WIDTH - PAD - R;
  const aCx = bCx - 2 * R - arrowW;
  const cy = PAD + 16;
  parts.push(
    circle(card.yesterday.from.headshot, card.yesterday.from.name, aCx, cy, R),
    circle(card.yesterday.to.headshot, card.yesterday.to.name, bCx, cy, R),
    `<path d="M${aCx + R + 5} ${cy} H${bCx - R - 5}" stroke="${MUTED}" stroke-width="2"/>`,
    `<path d="M${bCx - R - 12} ${cy - 5} l7 5 l-7 5" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Labelled as yesterday's, because the rows below are results for *this* pair and
    // the footer sells a different one.
    `<text x="${CARD_WIDTH - PAD}" y="${PAD + 62}" text-anchor="end" font-family="${FONT_FAMILIES.semibold}" font-size="10" letter-spacing="2.2" fill="${MUTED}">YESTERDAY'S CHAIN</text>`,
    `<line x1="${PAD}" y1="${rowsTop - 12}" x2="${CARD_WIDTH - PAD}" y2="${rowsTop - 12}" stroke="${LINE}"/>`,
  );

  // ── One row per player: avatar, name, chain length, grade ──
  for (const [i, row] of shown.entries()) {
    const y = rowsTop + i * ROW_H;
    parts.push(circle(row.avatar, row.name, PAD + 23, y + ROW_H / 2, 23));
    parts.push(
      `<text x="${PAD + 62}" y="${y + 30}" font-family="${FONT_FAMILIES.semibold}" font-size="21" fill="${INK}">${esc(drawable(row.name))}</text>`,
    );
    parts.push(
      `<text x="${PAD + 62}" y="${y + 50}" font-family="${FONT_FAMILIES.regular}" font-size="13" fill="${MUTED}">${row.players} ${row.players === 1 ? 'player' : 'players'}</text>`,
    );

    const blocks = row.blocks;
    const tone = TONES[blocks] ?? TONES[1];
    const size = 17;
    const gap = 6;
    const bx = CARD_WIDTH - PAD - (5 * size + 4 * gap);
    for (let s = 0; s < 5; s += 1) {
      const filled = s < blocks;
      parts.push(
        `<rect x="${bx + s * (size + gap)}" y="${y + 17}" width="${size}" height="${size}" rx="4" fill="${filled ? tone : 'none'}" stroke="${filled ? tone : EMPTY_BLOCK}" stroke-width="1.5"/>`,
      );
    }
    parts.push(
      `<text x="${CARD_WIDTH - PAD}" y="${y + 52}" text-anchor="end" font-family="${FONT_FAMILIES.medium}" font-size="12" fill="${MUTED}">${gradeLabel(row.blocks)}</text>`,
    );
  }

  // ── The cut, said out loud: how many played who are not drawn above ──
  if (others > 0) {
    const label = others === 1 ? '1 other player' : `${others} other players`;
    parts.push(
      `<text x="${PAD}" y="${rowsTop + shown.length * ROW_H + 14}" font-family="${FONT_FAMILIES.regular}" font-size="13" fill="${MUTED}">+ ${label} played today</text>`,
    );
  }

  // ── Footer: today's chain, pictured and named, then the ask. The button below the
  //    card does the launching, so the card never has to explain a command.
  parts.push(
    `<line x1="${PAD}" y1="${footerTop}" x2="${CARD_WIDTH - PAD}" y2="${footerTop}" stroke="${LINE}"/>`,
    `<text x="${PAD}" y="${footerTop + 26}" font-family="${FONT_FAMILIES.semibold}" font-size="11" letter-spacing="2.4" fill="${MUTED}">TODAY'S CHAIN</text>`,
  );
  const fitted = await fitNames(card.today.from.name, card.today.to.name);
  parts.push(pair(card.today.from, card.today.to, footerTop + 66, 19, fitted.size, fitted.widths));
  parts.push(
    `<text x="${PAD}" y="${footerTop + 112}" font-family="${FONT_FAMILIES.regular}" font-size="15" fill="${INK}">${esc(card.pitch)}</text>`,
  );

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}">`,
    `<rect width="${CARD_WIDTH}" height="${height}" fill="${BG}"/>`,
    parts.join('\n'),
    '</svg>',
  ].join('\n');

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
