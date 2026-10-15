// Generates the IKnoBall brand SVGs into ../../public/brand.
//
// Direction: the basketball replaces the O, so the word reads IKN [ball] BALL.
// All caps, stroke 19 on a 100 cap height, butt caps and mitred joins so the
// terminals stay flat and the K keeps a sharp vertex. The whole wordmark is
// skewed 12 degrees for forward lean.
//
// Run:  bun run build.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/brand');
mkdirSync(OUT, { recursive: true });
const out = (n, s) => writeFileSync(`${OUT}/${n}`, s);

const NAVY = '#1C4188';
const ORANGE = '#C4502F';
const CREAM = '#FCF3DC';
const WHITE = '#FFFFFF';
const INK = '#20201E';
const STROKE = 19;
const LEAN = 12;
const GAP = 8;
const BALL_W = 104; // r 52, so the round glyph overshoots the flat cap by 2

// ------------------------------------------------------------------ glyphs
// w is the advance width and already covers the stroke overshoot, so ink spans
// 0..w. Stroke centre paths run 9.5..90.5.
const G = {
  I: { w: 19, d: ['M9.5 9.5V90.5'] },
  K: { w: 72, d: ['M9.5 9.5V90.5', 'M60 9.5L9.5 50L66 90.5'] },
  N: { w: 61, d: ['M9.5 9.5V90.5', 'M51.5 9.5V90.5', 'M9.5 9.5L51.5 90.5'] },
  B: {
    w: 60,
    d: [
      'M9.5 9.5V90.5',
      'M9.5 9.5L27 9.5A18 20.25 0 0 1 27 50L9.5 50',
      'M9.5 50L29 50A20 20.25 0 0 1 29 90.5L9.5 90.5',
    ],
  },
  A: { w: 66, d: ['M9.5 90.5L26 9.5L40 9.5L56.5 90.5', 'M14.8 64.6L51.2 64.6'] },
  L: { w: 54, d: ['M9.5 9.5V90.5', 'M9.5 90.5L54 90.5'] },
};

const WORD = ['I', 'K', 'N', 'ball', 'B', 'A', 'L', 'L'];

// Basketball at cap height. cx/cy are its centre; r is its radius. The seams
// are clipped to the circle: the horizontal seam's round cap would otherwise
// poke 4 units past the edge and eat into the gap before the N or after the B.
let ballSeq = 0;
function ball(cx, cy, r, body, seam, sw, id = `ikb-ball-${++ballSeq}`) {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${body}"/>` +
    `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>` +
    `<g fill="none" stroke="${seam}" stroke-width="${sw}" stroke-linecap="round" clip-path="url(#${id})">` +
    `<path d="M${cx - r} ${cy}H${cx + r}"/>` +
    `<path d="M${cx} ${cy - r}C${cx - r * 0.72} ${cy - r * 0.7} ${cx - r * 0.72} ${cy + r * 0.7} ${cx} ${cy + r}"/>` +
    `<path d="M${cx} ${cy - r}C${cx + r * 0.72} ${cy - r * 0.7} ${cx + r * 0.72} ${cy + r * 0.7} ${cx} ${cy + r}"/>` +
    `</g>`
  );
}

// Returns { w, strokes, ball } where strokes are ungrouped letter paths and
// ball is the finished emblem markup.
function layout() {
  let x = 0;
  const strokes = [];
  let ballMarkup = '';
  for (const key of WORD) {
    if (key === 'ball') {
      ballMarkup = ball(x + BALL_W / 2, 50, BALL_W / 2, '@BODY@', '@SEAM@', '@SW@', '@ID@');
      x += BALL_W + GAP;
      continue;
    }
    const g = G[key];
    strokes.push(
      `<g transform="translate(${x} 0)">${g.d.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    );
    x += g.w + GAP;
  }
  return { w: x - GAP, strokes: strokes.join(''), ballMarkup: ballMarkup };
}

const L = layout();

// Paint the shared layout in a colour pair, applying the lean. `id` keeps the
// ball's clipPath unique per file, so two of these can be inlined into one page.
function wordmark(body, seam, sw, lean = true, id = `ikb-ball-${++ballSeq}`) {
  const letters =
    `<g fill="none" stroke="${body}" stroke-width="${STROKE}" stroke-linecap="butt" ` +
    `stroke-linejoin="miter" stroke-miterlimit="8">${L.strokes}</g>`;
  const ballM = L.ballMarkup
    .replace('@BODY@', body)
    .replace('@SEAM@', seam)
    .replace('@SW@', sw)
    .replaceAll('@ID@', id);
  const inner = letters + ballM;
  // skewX(-LEAN) moves the bottom left, so the word leans forward. Ink then
  // spans -21..w horizontally, hence the asymmetric padding.
  return lean ? `<g transform="skewX(-${LEAN})">${inner}</g>` : inner;
}

const svg = (x, y, w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="IKnoBall">\n` +
  `${body}\n</svg>\n`;

// Ink spans -21..w after the skew (100*tan(12) = 21.3), hence the asymmetric
// padding: the lean pushes the bottom of the word left by that much.
const PAD_L = 34; // lean overhang + stroke half, rounded up
const PAD_R = 14;
const PAD_Y = 14;

const sheet = (body, seam, sw, extra = '') =>
  svg(-PAD_L, -PAD_Y, L.w + PAD_L + PAD_R, 100 + PAD_Y * 2, extra + wordmark(body, seam, sw));

out('iknoball-primary.svg', sheet(NAVY, ORANGE, 8));
out('iknoball-white.svg', sheet(WHITE, ORANGE, 8));
out('iknoball-cream.svg', sheet(CREAM, NAVY, 8));
out('iknoball-ink.svg', sheet(INK, WHITE, 9)); // seams knocked out to the background

// upright, for documents where an italic mark is wrong
out('iknoball-upright.svg', svg(-12, -14, L.w + 24, 128, wordmark(NAVY, ORANGE, 8, false)));

// ------------------------------------------------------------------ stacked
const EM_R = 76;
const stackW = L.w + PAD_L + PAD_R;
const stackH = EM_R * 2 + 36 + 100;
out(
  'iknoball-stacked.svg',
  svg(
    -PAD_L,
    -PAD_Y,
    stackW,
    stackH + PAD_Y * 2,
    ball((stackW - PAD_L - PAD_R) / 2, EM_R, EM_R, NAVY, ORANGE, 12) +
      `<g transform="translate(0 ${EM_R * 2 + 36})">${wordmark(NAVY, ORANGE, 8)}</g>`,
  ),
);

// ------------------------------------------------------------- mark + icon
// Emblem alone: the ball at 160 with roomy seams.
out('iknoball-mark.svg', svg(-14, -14, 188, 188, ball(80, 80, 80, NAVY, ORANGE, 12)));

// Favicon: square artboard, seams thickened so they survive 16px.
out('iknoball-icon.svg', svg(0, 0, 64, 64, ball(32, 32, 32, NAVY, ORANGE, 15)));

// App-icon plate: navy rounded square with the cream ball reversed out of it.
out(
  'iknoball-app-icon.svg',
  svg(
    0,
    0,
    64,
    64,
    `<rect width="64" height="64" rx="14" fill="${NAVY}"/>` + ball(32, 32, 25, CREAM, NAVY, 7),
  ),
);

console.log('wrote to', OUT);
