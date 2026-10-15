import { useId, type SVGProps } from 'react';

/**
 * IKnoBall logo. The basketball replaces the O, so the word reads IKN [ball]
 * BALL. Paths are shared with the SVG files in public/brand (regenerate both
 * from apps/frontend/brand/build.mjs — do not edit one by hand).
 *
 * `currentColor` drives the letters and the ball body; the seams stay orange
 * unless `mono` is set, which paints them in `currentColor` too. Drop the
 * component anywhere and set the colour with a text utility.
 */

const LETTERS: { w: number; d: string[] }[] = [
  { w: 19, d: ['M9.5 9.5V90.5'] },
  { w: 72, d: ['M9.5 9.5V90.5', 'M60 9.5L9.5 50L66 90.5'] },
  { w: 61, d: ['M9.5 9.5V90.5', 'M51.5 9.5V90.5', 'M9.5 9.5L51.5 90.5'] },
  { w: 60, d: [] }, // placeholder for the ball, laid out below
  {
    w: 60,
    d: [
      'M9.5 9.5V90.5',
      'M9.5 9.5L27 9.5A18 20.25 0 0 1 27 50L9.5 50',
      'M9.5 50L29 50A20 20.25 0 0 1 29 90.5L9.5 90.5',
    ],
  },
  { w: 66, d: ['M9.5 90.5L26 9.5L40 9.5L56.5 90.5', 'M14.8 64.6L51.2 64.6'] },
  { w: 54, d: ['M9.5 9.5V90.5', 'M9.5 90.5L54 90.5'] },
  { w: 54, d: ['M9.5 9.5V90.5', 'M9.5 90.5L54 90.5'] },
];

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
  /** Paint the seams in `currentColor` instead of orange. */
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
  const seam = mono ? 'currentColor' : '#C4502F';
  const ballX = positions[3].x + BALL_W / 2;

  const letters = positions.map((p, i) =>
    p.key === 'ball' ? null : (
      <g key={i} transform={`translate(${p.x} 0)`}>
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
      <circle cx={ballX} cy={50} r={BALL_W / 2} fill="currentColor" />
      <g fill="none" stroke={seam} strokeWidth={8} strokeLinecap="round" clipPath={`url(#${clip})`}>
        <defs>
          <clipPath id={clip}>
            <circle cx={ballX} cy={50} r={BALL_W / 2} />
          </clipPath>
        </defs>
        <path d={`M${ballX - BALL_W / 2} 50H${ballX + BALL_W / 2}`} />
        <path
          d={`M${ballX} ${50 - BALL_W / 2}C${ballX - BALL_W * 0.36} ${
            50 - BALL_W * 0.35
          } ${ballX - BALL_W * 0.36} ${50 + BALL_W * 0.35} ${ballX} ${50 + BALL_W / 2}`}
        />
        <path
          d={`M${ballX} ${50 - BALL_W / 2}C${ballX + BALL_W * 0.36} ${
            50 - BALL_W * 0.35
          } ${ballX + BALL_W * 0.36} ${50 + BALL_W * 0.35} ${ballX} ${50 + BALL_W / 2}`}
        />
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
  const seam = mono ? 'currentColor' : '#C4502F';
  return (
    <svg viewBox="-6 -6 172 172" role="img" aria-label="IKnoBall" {...rest}>
      <circle cx={80} cy={80} r={80} fill="currentColor" />
      <g
        fill="none"
        stroke={seam}
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
        <path d="M80 0C22.4 24 22.4 136 80 160" />
        <path d="M80 0C137.6 24 137.6 136 80 160" />
      </g>
    </svg>
  );
}
