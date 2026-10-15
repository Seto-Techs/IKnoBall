/** The wordmark, spelled once so the three headers cannot disagree on it. */
const WORDMARK = 'IKnoBall';

/**
 * The IKnoBall lockup: the IK tile beside the wordmark.
 *
 * One definition for the three headers that carry it — the marketing page, the
 * plain page shell, and the app nav. They were three separate copies, and the app
 * nav's had drifted to a bare wordmark with no tile, which is the kind of thing a
 * single definition prevents.
 *
 * Only the structure is shared. Size, colour and spacing are the caller's,
 * because the three sit on different surfaces at different scales and space the
 * pair differently. That also keeps this honest: Tailwind resolves two competing
 * utilities — `gap-2.5` against `gap-3`, `font-bold` against `font-black` — by
 * CSS order rather than by class order, so a default baked in here could not be
 * reliably overridden by a caller that wanted something else.
 */
export function BrandMark({
  className,
  tileClassName,
  wordmarkClassName,
}: {
  /** Layout for the pair: the gap between the tile and the wordmark. */
  className?: string;
  /** Size, radius, background and type of the IK tile, weight included. */
  tileClassName: string;
  /** Type styles for the wordmark. */
  wordmarkClassName: string;
}) {
  return (
    <span className={`flex items-center ${className ?? ''}`}>
      <span className={`flex items-center justify-center font-heading text-white ${tileClassName}`}>
        IK
      </span>
      <span className={wordmarkClassName}>{WORDMARK}</span>
    </span>
  );
}
