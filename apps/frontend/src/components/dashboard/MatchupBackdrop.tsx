/*
 * The split team-color backdrop used by the league-wide carousel card and the
 * predictions slate card. Two diagonally-clipped color fields, a vertical light
 * gradient, soft corner highlights, and a dot grid clipped to each half.
 *
 * The 61% / 41% clip points are what make the seam lean; changing them changes
 * the angle on every card at once, which is why this lives in one place.
 */

const AWAY_CLIP = 'polygon(0 0, 61% 0, 41% 100%, 0 100%)';
const HOME_CLIP = 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)';
const DOT_GRID = 'radial-gradient(circle, rgba(255,255,255,0.96) 1.05px, transparent 1.35px)';

export function MatchupBackdrop({
  awayColor,
  homeColor,
  className,
}: {
  awayColor: string;
  homeColor: string;
  className?: string;
}) {
  return (
    <div className={`absolute inset-0 flex overflow-hidden ${className ?? ''}`} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: awayColor, clipPath: AWAY_CLIP }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: homeColor, clipPath: HOME_CLIP }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.18) 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 22% 18%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(ellipse 72% 52% at 86% 84%, rgba(0,0,0,0.18), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.2]"
        style={{ backgroundImage: DOT_GRID, backgroundSize: '11px 11px', clipPath: AWAY_CLIP }}
      />
      <div
        className="absolute inset-0 opacity-[0.2]"
        style={{ backgroundImage: DOT_GRID, backgroundSize: '11px 11px', clipPath: HOME_CLIP }}
      />
      <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" />
    </div>
  );
}

/** Shared text treatment so labels stay legible over any team color. */
export const MATCHUP_NAME_SHADOW = '0 2px 8px rgba(0,0,0,0.6)';
export const MATCHUP_LOGO_SHADOW = '0 6px 16px rgba(0,0,0,0.4)';
