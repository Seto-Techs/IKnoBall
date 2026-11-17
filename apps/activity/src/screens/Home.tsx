import type { ReactNode } from 'react';
import { ArrowRight, Link2, Target } from 'lucide-react';
import { fetchSlate, useResource } from '../lib/api';
import { formatDateLabel, shiftEtDate } from '../lib/game-utils';
import { fetchLebronnectMe, fetchPuzzle, playerLabel } from '../lib/lebronnect';
import { ErrorNote } from '../components/kit';
import type { Screen } from '../lib/nav';

/**
 * The launch screen: one row of cards, each a door rather than a board.
 *
 * Three across when there is room for three. Below that the coming-soon slot
 * collapses to a single centred line — it is the least important thing here and
 * it must never push the two real games onto a second row, where the row of
 * cards stops reading as a row.
 */
export function Home({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const tomorrow = shiftEtDate(1);
  const slate = useResource(() => fetchSlate(tomorrow), tomorrow);
  const puzzle = useResource(fetchPuzzle);
  const lebronnect = useResource(fetchLebronnectMe);

  const games = slate.data?.length ?? null;
  const solved = lebronnect.data?.result ?? null;

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        <span className="text-brand-navyDark">Tomorrow</span>
        <span aria-hidden>·</span>
        <span>{formatDateLabel(tomorrow)}</span>
        {games !== null && (
          <>
            <span aria-hidden>·</span>
            <span>
              {games} {games === 1 ? 'game' : 'games'}
            </span>
          </>
        )}
      </p>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="flex items-stretch gap-3 sm:gap-4">
          <LaunchCard
            icon={<Target className="h-5 w-5 text-brand-navy" aria-hidden />}
            title="Predictions"
            detail={
              games === null
                ? "Tomorrow's slate"
                : `${games} ${games === 1 ? 'game' : 'games'} tomorrow`
            }
            note="Call the winner before tip-off. Right calls pay points."
            cta="Make picks"
            onOpen={() => onOpen('predictions')}
          />
          <LaunchCard
            icon={<Link2 className="h-5 w-5 text-brand-navy" aria-hidden />}
            title="Lebronnect"
            detail={puzzle.data ? `Board #${puzzle.data.number}` : 'Today’s board'}
            note={
              solved
                ? `Solved today in ${playerLabel(solved.players)}.`
                : 'Link today’s two players through the teammates between them.'
            }
            cta="Play"
            onOpen={() => onOpen('lebronnect')}
          />

          {/* Three across only when the width is really there; the slot is the
              first thing to go, and it goes to a line rather than to a row. */}
          <article className="hidden shrink-0 basis-[24%] flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-white/55 p-4 text-center lg:flex">
            <p className="font-heading text-[13px] font-semibold uppercase tracking-[0.2em] text-stone-400">
              Coming soon
            </p>
            <p className="mt-2 text-[14px] leading-snug text-stone-500">
              Another game is warming up.
            </p>
          </article>
        </div>

        <p className="mt-3 text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-stone-400 lg:hidden">
          Another game is coming soon
        </p>
      </div>

      {(slate.error || puzzle.error) && <ErrorNote message={slate.error ?? puzzle.error ?? ''} />}

      <p className="text-center text-[12px] leading-relaxed text-stone-500">
        Picks lock at tip-off · Lebronnect resets at midnight ET
      </p>
    </div>
  );
}

function LaunchCard({
  icon,
  title,
  detail,
  note,
  cta,
  onOpen,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  note: string;
  cta: string;
  onOpen: () => void;
}) {
  return (
    <article className="flex min-w-0 flex-1 flex-col rounded-xl border border-brand-line bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10">
          {icon}
        </span>
        <h2 className="min-w-0 truncate font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.03em] text-brand-ink">
          {title}
        </h2>
      </div>

      <p className="mt-2.5 text-[13px] font-bold uppercase tracking-[0.12em] text-brand-orange">
        {detail}
      </p>
      <p className="mt-1.5 text-[14px] leading-snug text-stone-600">{note}</p>

      <button
        type="button"
        onClick={onOpen}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-3 font-heading text-[15px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-brand-navyDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </article>
  );
}
