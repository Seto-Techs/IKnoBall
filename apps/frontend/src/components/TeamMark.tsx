import type { CSSProperties, SyntheticEvent } from 'react';

/** The mark a side we do not track falls back to. Bundled, so it always renders. */
const LEAGUE_MARK = '/nba-logo.svg';

/**
 * A team's mark.
 *
 * A side with a `teams` row renders its own logo. A side without one — a preseason
 * tour, an exhibition squad, an All-Star team — has no logo to render, and its
 * abbreviation reads as though it were one of ours. The league mark in grayscale
 * says "NBA side we do not track" without inventing a wordmark for it.
 *
 * Grayscale rides on the `grayscale` utility, which composes with the caller's
 * `filter` utilities (the drop-shadow on the matchup marks). A caller that sets
 * `filter` inline instead — GameCard does — wins over the class, so that filter
 * gets grayscale appended rather than replaced.
 */
export function TeamMark({
  logoUrl,
  alt,
  className,
  style,
  onError,
  loading = 'lazy',
  plate = false,
}: {
  logoUrl?: string | null;
  /** Alt text for the team's own logo. The placeholder is decorative: the team's name sits beside it. */
  alt: string;
  className?: string;
  style?: CSSProperties;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  loading?: 'lazy' | 'eager';
  /**
   * Draw the placeholder on the league's navy disc instead of bare. The mark is
   * white on transparency, so on a light surface — the cream strips, the white
   * calendar and form cards — a bare one is invisible. The dark split panels do
   * not need it.
   */
  plate?: boolean;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        className={className}
        style={style}
        onError={onError}
        loading={loading}
      />
    );
  }

  const mark = (
    <img
      src={LEAGUE_MARK}
      alt=""
      aria-hidden="true"
      // On a disc the mark is sized as a share of the disc's box, so the padding
      // scales with the box rather than resolving against an ancestor's width.
      // Bare, it takes the caller's box, exactly as the logo it stands in for does.
      className={`${plate ? 'h-[70%] w-[70%]' : (className ?? '')} object-contain grayscale`}
      // A caller that sets `filter` inline (GameCard's drop-shadow) wins over the
      // `grayscale` class, so grayscale is appended to it rather than lost.
      style={
        plate
          ? undefined
          : style?.filter
            ? { ...style, filter: `${style.filter} grayscale(1)` }
            : style
      }
      loading={loading}
    />
  );

  if (!plate) return mark;

  // Same treatment as GlobalSearch's league avatar: the mark on the league's navy
  // disc, which is what the logo's own white-on-dark lockup expects.
  return (
    <span
      className={`flex items-center justify-center overflow-hidden rounded-full bg-brand-navyDark ${className ?? ''}`}
      style={style}
    >
      {mark}
    </span>
  );
}
