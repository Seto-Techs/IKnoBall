import { useId, type SVGProps } from 'react';

/**
 * IKnoBall logo. The basketball replaces the O, so the word reads IKN [ball]
 * BALL. Paths are shared with the SVG files in public/brand (regenerate both
 * from apps/frontend/brand/build.mjs — do not edit one by hand).
 *
 * `currentColor` drives the letters and the seams. The ball body is the one
 * orange element, so the mark reads as a basketball on any background; set
 * `mono` to paint it in `currentColor` as well. Drop the component anywhere and
 * set the ink with a text utility.
 */

const BALL_ORANGE = '#C4502F';
// Side seams: arcs centred outside the ball, so they bow toward the middle and
// die on the rim. A closed loop through the poles would be a meridian, and a
// meridian plus an equator is a globe.
const SEAM_ARC_R = 0.703;
const SEAM_ARC_D = 1.161;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** The two side seams of a ball of radius `r` centred on (cx, cy). */
function sideSeams(cx: number, cy: number, r: number) {
  const arc = round(r * SEAM_ARC_R);
  const off = round(r * SEAM_ARC_D);
  return [-1, 1].map((side) => <circle key={side} cx={round(cx + side * off)} cy={cy} r={arc} />);
}

// Advance width covers the stroke overshoot, so ink spans 0..w and 0..100
// vertically. A butt cap stops where the path stops, so stems run the full
// 0..100 while horizontal strokes sit on 9.5/90.5 and let their 19-unit body
// fill 0..19 or 81..100.
const LETTERS: { w: number; d: string[] }[] = [
  { w: 19, d: ['M9.5 0V100'] },
  { w: 72, d: ['M9.5 0V100', 'M60 9.5L9.5 50L66 90.5'] },
  { w: 61, d: ['M9.5 0V100', 'M51.5 0V100', 'M9.5 9.5L51.5 90.5'] },
  { w: 60, d: [] }, // placeholder for the ball, laid out below
  {
    w: 60,
    d: [
      'M9.5 0V100',
      'M9.5 9.5L27 9.5A18 20.25 0 0 1 27 50L9.5 50',
      'M9.5 50L29 50A20 20.25 0 0 1 29 90.5L9.5 90.5',
    ],
  },
  // Legs run past the baseline so the low corner of each butt cap lands on it.
  { w: 66, d: ['M7.95 98.1L26 9.5L40 9.5L58.05 98.1', 'M14.8 64.6L51.2 64.6'] },
  { w: 54, d: ['M9.5 0V100', 'M9.5 90.5L54 90.5'] },
  { w: 54, d: ['M9.5 0V100', 'M9.5 90.5L54 90.5'] },
];

// Every glyph is drawn on the cap line, then shifted by its own value here, so
// the letters stagger up and down by different amounts. Positive is down. This
// is a hand-picked draw, not a pattern, and the uneven baseline IS the mark —
// evening these out flattens it back into generic type. Mirrors DY in
// apps/frontend/brand/build.mjs; the ball entry stays on 0.
const DY = [4, -7, 2, 0, 6, -4, -8, 3];

const GAP = 8;
const BALL_W = 104;
const LEAN = 12;
const PAD_L = 34;
const PAD_R = 14;
const PAD_Y = 14;

const positions: { x: number; key: 'letter' | 'ball' }[] = (() => {
  let x = 0;
  const out: { x: number; key: 'letter' | 'ball' }[] = [];
  for (let i = 0; i < LETTERS.length; i += 1) {
    out.push({ x, key: i === 3 ? 'ball' : 'letter' });
    x += (i === 3 ? BALL_W : LETTERS[i].w) + GAP;
  }
  return out;
})();

const WIDTH = positions[positions.length - 1].x + LETTERS[LETTERS.length - 1].w;

export type LogoProps = SVGProps<SVGSVGElement> & {
  /** Paint the ball body in `currentColor` too, for one-colour reproduction. */
  mono?: boolean;
  /** Drop the 12deg forward lean, for documents and print. */
  upright?: boolean;
};

/** Horizontal lockup: emblem is the O, then the wordmark. */
export function Logo({ mono, upright, ...rest }: LogoProps) {
  // Clipped to the ball so the horizontal seam's round cap cannot poke past
  // the circle and eat into the gap before the N or after the B. useId carries
  // colons, which are fragile inside url(#…), so keep only alphanumerics.
  const clip = `ikb-ball-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const body = mono ? 'currentColor' : BALL_ORANGE;
  const ballX = positions[3].x + BALL_W / 2;

  const letters = positions.map((p, i) =>
    p.key === 'ball' ? null : (
      <g key={i} transform={`translate(${p.x} ${DY[i]})`}>
        {LETTERS[i].d.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ),
  );

  const art = (
    <>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={19}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit={8}
      >
        {letters}
      </g>
      <circle cx={ballX} cy={50} r={BALL_W / 2} fill={body} />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={8}
        strokeLinecap="round"
        clipPath={`url(#${clip})`}
      >
        <defs>
          <clipPath id={clip}>
            <circle cx={ballX} cy={50} r={BALL_W / 2} />
          </clipPath>
        </defs>
        <path d={`M${ballX - BALL_W / 2} 50H${ballX + BALL_W / 2}`} />
        <path d={`M${ballX} ${50 - BALL_W / 2}V${50 + BALL_W / 2}`} />
        {sideSeams(ballX, 50, BALL_W / 2)}
      </g>
    </>
  );

  return (
    <svg
      viewBox={`${upright ? -12 : -PAD_L} -${PAD_Y} ${
        upright ? WIDTH + 24 : WIDTH + PAD_L + PAD_R
      } 128`}
      role="img"
      aria-label="IKnoBall"
      {...rest}
    >
      {upright ? art : <g transform={`skewX(-${LEAN})`}>{art}</g>}
    </svg>
  );
}

/** The basketball alone. Below roughly 36px, use this rather than the lockup. */
export function LogoMark({ mono, ...rest }: Omit<LogoProps, 'upright'>) {
  const clip = `ikb-mark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const body = mono ? 'currentColor' : BALL_ORANGE;
  return (
    <svg viewBox="-6 -6 172 172" role="img" aria-label="IKnoBall" {...rest}>
      <circle cx={80} cy={80} r={80} fill={body} />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={12}
        strokeLinecap="round"
        clipPath={`url(#${clip})`}
      >
        <defs>
          <clipPath id={clip}>
            <circle cx={80} cy={80} r={80} />
          </clipPath>
        </defs>
        <path d="M0 80H160" />
        <path d="M80 0V160" />
        {sideSeams(80, 80, 80)}
      </g>
    </svg>
  );
}
