import type { ReactNode } from 'react';

import { formatGameDate, hexLuminance } from '../../lib/game-utils';

export { formatGameDate, hexLuminance };

/* ── Panels ──────────────────────────────────────────────── */

export function Panel({
  title,
  icon,
  children,
  className,
  contentClassName,
  clip = false,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Clip children to the rounded corners. */
  clip?: boolean;
}) {
  return (
    <section
      // `overflow-hidden` makes this section the title's scroll container, and a
      // sticky title offsets against its own scroll container — so the header
      // height must not apply here, or the title slides down over the content.
      className={`flex flex-col rounded-lg border border-brand-line bg-white ${
        clip ? 'overflow-hidden [--sticky-offset:0px]' : ''
      } ${className ?? ''}`}
    >
      <h2 className="sticky top-[var(--sticky-offset)] z-10 flex items-center gap-2 border-b border-brand-line bg-white px-5 py-3 font-heading text-2xl font-semibold uppercase tracking-wide text-brand-ink">
        {icon}
        {title}
      </h2>
      <div className={`flex min-h-0 flex-1 flex-col ${contentClassName ?? ''}`}>{children}</div>
    </section>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8" role="status">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-navy" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-base text-stone-600">{message}</p>
    </div>
  );
}
