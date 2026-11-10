import type { ReactNode } from 'react';

/**
 * Kicker, heading and an optional aside, for the two shelves.
 *
 * The landing band and the games page use the same treatment so the section is
 * recognisably the same section in both places — the band is a preview of the
 * page, not a second design.
 */
export function SectionHead({
  kicker,
  title,
  aside,
  children,
}: {
  kicker: string;
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            {kicker}
          </span>
          <h2 className="mt-3 font-heading text-3xl font-black uppercase leading-none tracking-tight text-brand-ink sm:text-4xl">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {children}
    </>
  );
}
