# IKnoBall brand

The mark is the word **IKNOBALL** with a basketball in place of the O. All caps,
19-unit stroke on a 100-unit cap height, 12° forward lean, flat sheared
terminals. The ball is the only orange element in the mark; the letters and the
seams take the same ink, so the wordmark works on any background.

## The ball

Four seams, all of them ending on the rim:

- the equator, rim to rim through the centre;
- the prime meridian, rim to rim through the centre;
- two side seams drawn as arcs whose **centres sit outside the ball**
  (`r × 1.161` away, radius `r × 0.703`), so they bow toward the middle and die
  on the rim.

Nothing is a closed loop concentric with the ball. A loop through both poles is
a meridian, and a meridian plus an equator is a globe — that is what the mark
looked like before, and no colour change fixes it. If you redraw the seams, keep
the side arcs concave toward the rim and keep their centres outside the ball.

Seam weight is roughly 8% of the ball diameter everywhere. Do not thicken the
favicon: at 16px more than about 10% turns the ball into a blob.

## The stagger

Every glyph is drawn on the cap line and then shifted by its own value, so the
letters sit at different heights:

| I   | K   | N   | ball | B   | A   | L   | L   |
| --- | --- | --- | ---- | --- | --- | --- | --- |
| +4  | −7  | +2  | 0    | +6  | −4  | −8  | +3  |

Positive is down, in cap-height units. The uneven baseline **is** the mark — it
is what stops the wordmark reading as generic type, so do not "fix" it and do
not tidy it into a pattern. The draw is hand-picked on purpose: adjacent letters
move the same way in places (B and A), and the two Ls land 11 units apart.

The offsets live in `DY`, in both `build.mjs` and `Logo.tsx`. Keep them within
±8: the letters then ink −8..106 inside the 128-unit sheet, which runs −14..114.
The ball never moves; it is the one thing the letters stagger around.

## Files

Regenerate everything with `bun run build.mjs`. The SVGs land in
`../public/brand/`, so they are served at `/brand/<name>.svg` and downloadable
from a running app.

| File                    | Use                                                          |
| ----------------------- | ------------------------------------------------------------ |
| `iknoball-primary.svg`  | Default. Navy on light backgrounds.                          |
| `iknoball-white.svg`    | On navy, ink or photo.                                       |
| `iknoball-cream.svg`    | On navy, when white is too cold.                             |
| `iknoball-ink.svg`      | One-colour print; seams knocked out to the background.       |
| `iknoball-upright.svg`  | Documents and print, where an italic mark is wrong.          |
| `iknoball-stacked.svg`  | Splash screens and empty states.                             |
| `iknoball-mark.svg`     | The basketball alone, from ~40px up.                         |
| `iknoball-icon.svg`     | Favicon. Cream seams so it holds on light and dark tab bars. |
| `iknoball-app-icon.svg` | Home-screen icon: orange ball on a navy plate.               |

## Using it in the app

Import the React component rather than the files, so the mark inherits colour:

```tsx
import { Logo, LogoMark } from '../components/brand/Logo';

<Logo className="h-7 w-auto text-brand-navy" />
<LogoMark className="h-12 w-12 text-brand-cream" />
```

`currentColor` paints the letters and the seams. The ball body stays orange
unless you add `mono`, which paints it in `currentColor` for one-colour work.
`upright` drops the lean. Keep the paths in this component and `build.mjs` in
sync — both are generated from the same glyph table, so change one and change
the other.

## Placement

- **Nav / header** — horizontal lockup, 28px tall, left-aligned, links home.
- **Landing nav and footer** — `text-white`, on the navy surface.
- **Auth cards** — `LogoMark` at 48px, centred above the heading.
- **Anything under 36px** — use `LogoMark`, not the lockup. The counters close
  up below that.
- **Favicon** — `LogoMark`. Never the lockup.

## Rules

- Minimum clear space equals the ball radius on every side.
- Navy on white, or white/cream on navy. Never cream on white — it is ~1.1:1.
- Orange is the ball body and the active nav underline only. It is not a text
  colour.
- Do not rotate, recolour the ball, add a shadow, or set the wordmark in a
  different typeface.
- Do not stretch it. Scale from the height and let the width follow.
