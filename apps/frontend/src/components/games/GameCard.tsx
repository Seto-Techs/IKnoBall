import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../profile/parts';
import {
  headshotUrl,
  useLebronnectMe,
  useLebronnectPuzzle,
  type ConnectPlayer,
} from '../../lib/use-lebronnect';
import { ScoreMeter, gradeLabel } from '../connect/parts';
import { useSession } from '../../lib/use-auth';
import type { MiniGame } from './catalog';

/**
 * One game, one shape.
 *
 * The live card and the coming-soon skeleton are the same box at the same height
 * — only the contents change — so a row of them reads as a shelf rather than as a
 * live thing next to a gap. Both the landing band and the games page render this
 * component, so the card is designed once and judged at the same size in both.
 *
 * The board is read here rather than passed down, so every card on every surface
 * shows the same two players without the page threading them through.
 */
export function GameCard({ game }: { game: MiniGame }) {
  if (game.state === 'soon') return <SoonCard />;
  return <LiveCard game={game} />;
}

function LiveCard({ game }: { game: Extract<MiniGame, { state: 'live' }> }) {
  const { data: board } = useLebronnectPuzzle();
  // The card also renders on the signed-out landing page, where there is no
  // record to read and asking for one would only 401.
  const { data: session } = useSession();
  const { data: me } = useLebronnectMe(!!session?.user);
  // Finished today or not is the only state the card has to get right: a player
  // who solved it and still reads "unplayed" will go back in expecting a board.
  const done = me?.result ?? null;

  return (
    <Link
      to={game.to}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm transition hover:border-brand-navy/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-3">
        <span className="font-heading text-[13px] font-bold uppercase tracking-[0.16em] text-brand-ink">
          {game.name}
          {board ? (
            <>
              {' '}
              <span className="text-stone-300">·</span> #{board.number}
            </>
          ) : null}
        </span>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-gold/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-brand-navyDark ring-1 ring-brand-gold/60">
            <ScoreMeter
              rating={done.blocks}
              label={gradeLabel(done.players, done.par)}
              tone="light"
            />
            {gradeLabel(done.players, done.par)}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-navy px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Unplayed
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="flex items-center gap-2">
          <Face player={board?.start} />
          <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
          <Face player={board?.target} />
        </div>

        <p className="mt-4 font-heading text-lg font-semibold uppercase leading-tight tracking-wide text-brand-ink">
          {board ? (
            <>
              {board.start.name} <span className="text-stone-400">→</span> {board.target.name}
            </>
          ) : (
            <span className="text-stone-400">Today&rsquo;s board</span>
          )}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{game.blurb}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-brand-line px-5 py-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
          Daily · resets in 8h
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-brand-navyDark">
          {done ? 'Review' : 'Play'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

/**
 * The empty slot. Deliberately not a copy of the live card: a greyed-out copy
 * reads as a broken board, so the slot says what it is — one big unknown, no
 * faces, no button that looks tappable.
 */
function SoonCard() {
  return (
    <div
      aria-disabled="true"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-line bg-white/70"
    >
      <div className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-3">
        <span className="font-heading text-[13px] font-bold uppercase tracking-[0.16em] text-stone-400">
          Next game
        </span>
        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-stone-500">
          Coming soon
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="flex flex-1 items-center justify-center py-2">
          <span
            aria-hidden="true"
            className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-stone-300 bg-stone-50 font-heading text-5xl font-black leading-none text-stone-300"
          >
            ?
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-brand-line px-5 py-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
          No board yet
        </span>
        <span className="inline-flex shrink-0 items-center rounded-lg bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-400">
          Soon
        </span>
      </div>
    </div>
  );
}

/** One endpoint of today's board. The dash holds the shape while it loads. */
function Face({ player, size = 56 }: { player?: ConnectPlayer; size?: number }) {
  if (!player) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-stone-300 bg-stone-50 font-heading text-sm font-bold text-stone-300"
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }

  return (
    <Avatar
      name={player.name}
      image={headshotUrl(player.externalId)}
      size={size}
      className="ring-2 ring-white"
    />
  );
}
