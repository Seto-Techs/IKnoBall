# IKnoBall brand

The mark is the word **IKNOBALL** with a basketball in place of the O. All caps,
19-unit stroke on a 100-unit cap height, 12° forward lean, flat sheared
terminals. Navy body, orange seams.

## Files

Regenerate everything with `bun run build.mjs`. The SVGs land in
`../public/brand/`, so they are served at `/brand/<name>.svg` and downloadable
from a running app.

| File                    | Use                                                    |
| ----------------------- | ------------------------------------------------------ |
| `iknoball-primary.svg`  | Default. Navy on light backgrounds.                    |
| `iknoball-white.svg`    | On navy, ink or photo.                                 |
| `iknoball-cream.svg`    | On navy, when white is too cold.                       |
| `iknoball-ink.svg`      | One-colour print; seams knocked out to the background. |
| `iknoball-upright.svg`  | Documents and print, where an italic mark is wrong.    |
| `iknoball-stacked.svg`  | Splash screens and empty states.                       |
| `iknoball-mark.svg`     | The basketball alone, from ~40px up.                   |
| `iknoball-icon.svg`     | Favicon. Seams thickened to survive 16px.              |
| `iknoball-app-icon.svg` | Home-screen icon: cream ball on a navy plate.          |

## Using it in the app

Import the React component rather than the files, so the mark inherits colour:

```tsx
import { Logo, LogoMark } from '../components/brand/Logo';

<Logo className="h-7 w-auto text-brand-navy" />
<LogoMark className="h-12 w-12 text-brand-cream" />
```

`currentColor` paints the letters and the ball body. Add `mono` to paint the
seams in `currentColor` too, and `upright` to drop the lean. Keep the paths in
this component and `build.mjs` in sync — both are generated from the same
glyph table, so change one and change the other.

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
- Orange is for seams and the active nav underline only. It is not a text
  colour.
- Do not rotate, re-colour the seams separately, add a shadow, or set the
  wordmark in a different typeface.
- Do not stretch it. Scale from the height and let the width follow.
