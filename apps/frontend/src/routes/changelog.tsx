import { createFileRoute } from '@tanstack/react-router';
import { RELEASES, VERSION } from '@iknoball/release';
import { ReleaseNotes } from '../components/release/ReleaseNotes';

/**
 * The full changelog — every release, newest first.
 *
 * It renders the same notes the What's New dialog shows, from the same data, so
 * the greeting and the archive can never disagree. The dialog links here when a
 * player has skipped more than one release.
 */
export const Route = createFileRoute('/changelog')({
  component: ChangelogPage,
});

function ChangelogPage() {
  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-brand-line bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
      <h1 className="font-heading text-3xl font-black uppercase tracking-tight text-brand-ink sm:text-4xl">
        Changelog
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
        Everything IKnoBall has shipped, newest first. You are on{' '}
        <span className="font-semibold text-brand-ink">v{VERSION}</span>.
      </p>

      <ol className="mt-10 space-y-8">
        {RELEASES.map((release, index) => (
          <li
            key={release.version}
            className={index === 0 ? '' : 'border-t border-brand-line pt-8'}
          >
            <ReleaseNotes release={release} />
          </li>
        ))}
      </ol>
    </article>
  );
}
