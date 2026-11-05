// Generates the IKnoBall brand SVGs into ../../public/brand.
//
// Direction: the basketball replaces the O, so the word reads IKN [ball] BALL.
// All caps, stroke 19 on a 100 cap height, butt caps and mitred joins so the
// terminals stay flat and the K keeps a sharp vertex. The whole wordmark is
// skewed 12 degrees for forward lean, and every glyph is then knocked off the
// cap line by its own amount, so the letters stagger. That stagger is the
// design, not a bug: see DY below.
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
// 0..w. Every glyph inks exactly 0..100 vertically, and it takes two conventions
// to get there, because a butt cap stops at the end of the path: a stem has to
// run the full 0..100, while a horizontal stroke sits on 9.5 or 90.5 so its
// 19-unit body fills 0..19 or 81..100. Mixing the two is what makes a stem-topped
// letter (I K N L) sit 9.5 short of a bar-topped one (B A).
const G = {
  I: { w: 19, d: ['M9.5 0V100'] },
  K: { w: 72, d: ['M9.5 0V100', 'M60 9.5L9.5 50L66 90.5'] },
  N: { w: 61, d: ['M9.5 0V100', 'M51.5 0V100', 'M9.5 9.5L51.5 90.5'] },
  B: {
    w: 60,
    d: [
      'M9.5 0V100',
      'M9.5 9.5L27 9.5A18 20.25 0 0 1 27 50L9.5 50',
      'M9.5 50L29 50A20 20.25 0 0 1 29 90.5L9.5 90.5',
    ],
  },
  // The legs run past the baseline until the low corner of their butt caps
  // lands on it: a perpendicular cut on a leaning stroke would otherwise leave
  // both feet 7.6 units short and the A would look lifted off the line.
  A: { w: 66, d: ['M7.95 98.1L26 9.5L40 9.5L58.05 98.1', 'M14.8 64.6L51.2 64.6'] },
  L: { w: 54, d: ['M9.5 0V100', 'M9.5 90.5L54 90.5'] },
};

const WORD = ['I', 'K', 'N', 'ball', 'B', 'A', 'L', 'L'];

// The wordmark is deliberately off the line. Each glyph is drawn on the cap
// line above, then shifted by its own value here, so the letters stagger up and
// down by different amounts. Positive is down. This is a hand-picked draw, not
// a pattern: no two neighbours move the same way except B/A, the two Ls land 11
// units apart, and every value is different. The uneven baseline IS the mark —
// evening these out flattens it back into generic type. Keep them inside ±8 so
// the ink still fits the 128-unit sheet (letters then span -8..106, and the
// sheet runs -14..114).
const DY = [4, -7, 2, 0, 6, -4, -8, 3];

const SEAM_ARC_R = 0.703; // side-seam radius, as a fraction of the ball radius
const SEAM_ARC_D = 1.161; // side-seam centre distance, same units (centre sits outside the ball)
const round = (v) => Math.round(v * 1000) / 1000;

// Basketball at cap height. cx/cy are its centre; r is its radius. The seams
// are clipped to the circle: the horizontal seam's round cap would otherwise
// poke 4 units past the edge and eat into the gap before the N or after the B.
//
// The seams are the equator and the prime meridian, both rim to rim through the
// centre, plus two side seams whose centres sit OUTSIDE the ball, so they bow
// toward the middle and die on the rim. Nothing is a closed loop through the
// poles: a loop concentric with the ball is a meridian, and a meridian plus an
// equator is a globe.
let ballSeq = 0;
function ball(cx, cy, r, body, seam, sw, id = `ikb-ball-${++ballSeq}`) {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${body}"/>` +
    `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>` +
    `<g fill="none" stroke="${seam}" stroke-width="${sw}" stroke-linecap="round" clip-path="url(#${id})">` +
    `<path d="M${cx - r} ${cy}H${cx + r}"/>` +
    `<path d="M${cx} ${cy - r}V${cy + r}"/>` +
    `<circle cx="${round(cx - r * SEAM_ARC_D)}" cy="${cy}" r="${round(r * SEAM_ARC_R)}"/>` +
    `<circle cx="${round(cx + r * SEAM_ARC_D)}" cy="${cy}" r="${round(r * SEAM_ARC_R)}"/>` +
    `</g>`
  );
}

// Returns { w, strokes, ball } where strokes are ungrouped letter paths and
// ball is the finished emblem markup.
function layout() {
  let x = 0;
  const strokes = [];
  let ballMarkup = '';
  for (const [i, key] of WORD.entries()) {
    if (key === 'ball') {
      ballMarkup = ball(x + BALL_W / 2, 50, BALL_W / 2, '@BODY@', '@SEAM@', '@SW@', '@ID@');
      x += BALL_W + GAP;
      continue;
    }
    const g = G[key];
    strokes.push(
      `<g transform="translate(${x} ${DY[i]})">${g.d.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    );
    x += g.w + GAP;
  }
  return { w: x - GAP, strokes: strokes.join(''), ballMarkup: ballMarkup };
}

const L = layout();

// Paint the shared layout, applying the lean. The ball body is its own colour:
// it is the only orange element in the mark, and the seams are cut from the
// same ink as the letters. `id` keeps the ball's clipPath unique per file, so
// two of these can be inlined into one page.
function wordmark(letter, ballBody, seam, sw, lean = true, id = `ikb-ball-${++ballSeq}`) {
  const letters =
    `<g fill="none" stroke="${letter}" stroke-width="${STROKE}" stroke-linecap="butt" ` +
    `stroke-linejoin="miter" stroke-miterlimit="8">${L.strokes}</g>`;
  const ballM = L.ballMarkup
    .replace('@BODY@', ballBody)
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

const sheet = (letter, ballBody, seam, sw, extra = '') =>
  svg(
    -PAD_L,
    -PAD_Y,
    L.w + PAD_L + PAD_R,
    100 + PAD_Y * 2,
    extra + wordmark(letter, ballBody, seam, sw),
  );

// The ball is orange in every lockup; only the ink of the letters and seams
// changes, so the mark reads as a basketball on any background.
out('iknoball-primary.svg', sheet(NAVY, ORANGE, NAVY, 8));
out('iknoball-white.svg', sheet(WHITE, ORANGE, WHITE, 8));
out('iknoball-cream.svg', sheet(CREAM, ORANGE, CREAM, 8));
out('iknoball-ink.svg', sheet(INK, INK, WHITE, 9)); // one colour, seams knocked out

// upright, for documents where an italic mark is wrong
out('iknoball-upright.svg', svg(-12, -14, L.w + 24, 128, wordmark(NAVY, ORANGE, NAVY, 8, false)));

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
    ball((stackW - PAD_L - PAD_R) / 2, EM_R, EM_R, ORANGE, NAVY, 12) +
      `<g transform="translate(0 ${EM_R * 2 + 36})">${wordmark(NAVY, ORANGE, NAVY, 8)}</g>`,
  ),
);

// ------------------------------------------------------------- mark + icon
// Emblem alone: the ball at 160 with roomy seams.
out('iknoball-mark.svg', svg(-14, -14, 188, 188, ball(80, 80, 80, ORANGE, NAVY, 12)));

// Favicon: square artboard. Seam weight stays proportional — with four seams
// any thickening turns 16px into a blob. Seams are cream, not navy: the seams
// end on the rim, so navy ones vanish into a dark tab bar and notch the ball
// into wedges. Cream reads against the orange body on any chrome.
out('iknoball-icon.svg', svg(0, 0, 64, 64, ball(32, 32, 32, ORANGE, CREAM, 4.5)));

// App-icon plate: navy rounded square with the ball reversed out of it.
out(
  'iknoball-app-icon.svg',
  svg(
    0,
    0,
    64,
    64,
    `<rect width="64" height="64" rx="14" fill="${NAVY}"/>` + ball(32, 32, 25, ORANGE, CREAM, 4),
  ),
);

console.log('wrote to', OUT);
