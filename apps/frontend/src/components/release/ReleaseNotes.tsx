import { format, parseISO } from 'date-fns';
import type { ChangeKind, Release } from '@iknoball/release';

/**
 * One release's notes, shared by the What's New dialog and the changelog page.
 *
 * The labels are for players, not for the people who wrote the commits: "New",
 * "Better" and "Fixed" over the conventional "Added"/"Changed"/"Fixed", and
 * never a commit subject.
 */

const KIND: Record<ChangeKind, { label: string; className: string }> = {
  added: { label: 'New', className: 'bg-arena-100 text-arena-800' },
  improved: { label: 'Better', className: 'bg-court-100 text-court-800' },
  fixed: { label: 'Fixed', className: 'bg-basketball-50 text-basketball-700' },
};

export function releaseDate(release: Release): string {
  return format(parseISO(release.date), 'd MMM yyyy');
}

/**
 * `heading` is off in the What's New dialog, whose own header already states the
 * version, so the notes do not repeat it there.
 */
export function ReleaseNotes({ release, heading = true }: { release: Release; heading?: boolean }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {heading && (
          <h3 className="font-heading text-lg font-bold uppercase tracking-wide text-brand-ink">
            v{release.version}
          </h3>
        )}
        <time
          dateTime={release.date}
          className="ml-auto text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400"
        >
          {releaseDate(release)}
        </time>
      </div>

      <p className="mt-1 text-sm leading-relaxed text-stone-600">{release.headline}</p>

      <ul className="mt-3 space-y-2.5">
        {release.changes.map((change) => (
          <li key={change.text} className="flex gap-2.5 text-sm leading-relaxed text-stone-600">
            <span
              className={`mt-[3px] h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${KIND[change.kind].className}`}
            >
              {KIND[change.kind].label}
            </span>
            <span>{change.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
