import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../kit';
import {
  headshotUrl,
  type ChainLink,
  type LebronnectPuzzle,
  type LebronnectResult,
  type PlayerSuggestion,
} from '../../lib/lebronnect';
import {
  GuessBox,
  intermediaryCount,
  ReceiptLine,
  SolvedActions,
  Tag,
  type ClubLookup,
} from './parts';

export type SplitHeroProps = {
  puzzle: LebronnectPuzzle;
  /** The chain so far, start first. Ends on the target once the board is done. */
  chain: ChainLink[];
  /** The graded result, or null while the chain is still open. */
  result: LebronnectResult | null;
  /** Resolves to a rejection message, or null when the hop was accepted. */
  onPick: (player: PlayerSuggestion) => Promise<string | null>;
  /** Abbreviation → club, so each receipt draws the club's own badge. */
  clubOf?: ClubLookup;
};

/* ── Split hero ─────────────────────────────────────────────
 * Navy panel owns the matchup and the input; the right is the proof.
 *
 * The site's version is the same card, and this is the same card at Discord's
 * scale: the panel takes a fixed column, the chain takes the rest, and a vertical
 * spine runs through every connector so the chain reads as one object rather than
 * as a list. The one structural difference is height — the site's card grows with
 * the chain, this one fills the window and the chain scrolls inside it, because a
 * mobile-landscape activity window is about 300px of card and a six-link chain is
 * taller than that.
 */

/** A section of the vertical spine, between the avatars above and below. */
function SplitConnector({
  children,
  dashed,
  grow,
}: {
  children?: ReactNode;
  dashed?: boolean;
  grow?: boolean;
}) {
  return (
    <div className={`flex items-stretch gap-2.5 ${grow ? 'min-h-10 flex-1' : ''}`}>
      <span className="flex w-[42px] shrink-0 justify-center" aria-hidden>
        <span
          className={
            dashed
              ? '-my-1.5 w-0 self-stretch border-l border-dashed border-stone-300'
              : '-my-1 w-px self-stretch bg-brand-line'
          }
        />
      </span>
      <div
        className={`flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1 ${
          grow ? 'items-end py-1' : 'items-center'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type ChainRole = 'start' | 'target' | 'middle';

/** One player in a chain: the headshot, the name, and the endpoint tag it earns. */
function ChainRow({ link, role }: { link: ChainLink; role: ChainRole }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5">
      <Avatar
        name={link.name}
        image={headshotUrl(link.externalId)}
        size={42}
        className={
          role === 'start'
            ? 'ring-2 ring-brand-navyDark'
            : role === 'target'
              ? 'ring-2 ring-basketball-500'
              : 'ring-2 ring-basketball-400'
        }
      />
      <p className="min-w-0 max-w-full shrink truncate font-heading text-[17px] font-semibold uppercase leading-tight tracking-wide text-brand-ink">
        {link.name}
      </p>
      {role === 'start' ? (
        <span className="ml-auto">
          <Tag tone="navy">Start</Tag>
        </span>
      ) : role === 'target' ? (
        <span className="ml-auto">
          <Tag tone="orange">Target</Tag>
        </span>
      ) : null}
    </div>
  );
}

/**
 * The open end of an unsolved chain: the dashed hop to a target not yet reached.
 * It takes the column's slack, so the dashed line runs down to the target instead
 * of leaving a blank panel under the last row.
 */
function UnsolvedHop({ current }: { current?: ChainLink }) {
  return (
    <SplitConnector dashed grow>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm border border-dashed border-stone-300 px-1 font-heading text-[10px] font-bold leading-none text-stone-500">
        ?
      </span>
      <span className="text-[12px] text-stone-500">
        Your pick
        {current ? ` — anyone who shared a team with ${current.name}` : null}
      </span>
    </SplitConnector>
  );
}

/** The target, still out of reach: the end the whole chain is aiming at. */
function TargetRow({ target }: { target: LebronnectPuzzle['target'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2">
      <Avatar
        name={target.name}
        image={headshotUrl(target.externalId)}
        size={40}
        className="ring-2 ring-basketball-500 opacity-80"
      />
      <p className="min-w-0 flex-1 truncate font-heading text-[16px] font-semibold uppercase leading-tight tracking-wide text-stone-500">
        {target.name}
      </p>
      <Tag tone="orange">Target</Tag>
    </div>
  );
}

export function SplitHero({ puzzle, chain, result, onPick, clubOf }: SplitHeroProps) {
  const solved = result !== null;
  const current = chain[chain.length - 1];
  const count = solved ? result.players : intermediaryCount(chain, false);

  // A hop lands at the bottom of the column, which on a short window is out of
  // view; the newest row is the one the player just made, so it is brought in.
  const columnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = columnRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chain.length, solved]);

  /** A row and the connector that joins it to the row above. */
  const hop = (link: ChainLink, index: number, role: ChainRole) => (
    <div key={`${link.id}-${index}`} className="flex flex-col">
      {/* The receipt sits on the connector, between the player above and this one:
          the badge is the link, not a label at the end of a band. */}
      {index > 0 && (
        <SplitConnector>
          <ReceiptLine receipt={link.receipt} clubOf={clubOf} />
        </SplitConnector>
      )}
      <ChainRow link={link} role={role} />
    </div>
  );

  return (
    <section className="flex min-h-[19rem] flex-1 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      {/* Stat strip. One row, always present, so the card has a top edge and the
          score is visible without hunting for it. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-brand-line bg-stone-50 px-4 py-2">
        <span className="font-heading text-[12px] font-bold uppercase tracking-[0.22em] text-brand-navyDark">
          Lebronnect
        </span>
        <span className="text-stone-300">·</span>
        <span className="font-heading text-[12px] font-bold uppercase tracking-[0.16em] text-stone-500">
          #{puzzle.number}
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-[12.5px] font-semibold text-stone-600">
          {new Date(`${puzzle.date}T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-[12.5px] text-stone-500">Modern pool</span>
        <span className="ml-auto inline-flex items-baseline gap-1.5">
          <span className="font-heading text-[19px] font-bold leading-none text-brand-navyDark">
            {count}
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-500">
            {count === 1 ? 'player in' : 'players in'}
          </span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 sm:grid-cols-[minmax(0,16.5rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 bg-brand-navyDark px-4 py-3.5 text-white">
          {/* Faces above each name, so the matchup reads as two people rather
              than two strings — and the two are the largest objects in the panel,
              which is what stops it reading as a form. */}
          <div className="flex w-full items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              <Avatar
                name={puzzle.start.name}
                image={headshotUrl(puzzle.start.externalId)}
                size={58}
                className="ring-2 ring-white/40"
              />
              <p className="font-heading text-[16px] font-semibold uppercase leading-[1.05] tracking-wide">
                {puzzle.start.name}
              </p>
            </div>
            <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-brand-orange" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5 text-right">
              <Avatar
                name={puzzle.target.name}
                image={headshotUrl(puzzle.target.externalId)}
                size={58}
                className="ring-2 ring-basketball-400"
              />
              <p className="font-heading text-[16px] font-semibold uppercase leading-[1.05] tracking-wide">
                {puzzle.target.name}
              </p>
            </div>
          </div>

          {result ? (
            /* The finish, in the panel where the matchup lived: two numerals,
               yours and the floor's, side by side. */
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {result.perfect ? 'Perfect' : 'Solved'}
              </p>
              <div className="mt-1.5 flex items-end gap-4">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-[42px] font-bold leading-[0.85]">
                    {result.players}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    you
                  </span>
                </span>
                <span className="mb-1.5 h-8 w-px bg-white/20" aria-hidden />
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-[42px] font-bold leading-[0.85] text-brand-gold">
                    {result.par}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    best
                  </span>
                </span>
              </div>
              <SolvedActions result={result} />
            </div>
          ) : (
            /* The input block takes the panel's slack and centres in it, so a
               two-row chain reads as breathing room around the field. */
            <div className="flex flex-1 flex-col justify-center">
              <GuessBox current={current} exclude={chain.map((link) => link.id)} onPick={onPick} />
            </div>
          )}

          {/* Footer of the panel: the rule that keeps the game hard, stated once. */}
          <p className="border-t border-white/10 pt-2 text-[11.5px] leading-relaxed text-slate-400">
            {result
              ? 'Every name you added was one player. The start and the target never count.'
              : 'Every name you add is one player. The start and the target never count.'}
          </p>
        </div>

        <div className="flex min-h-0 flex-col px-4 py-1.5">
          {/* `-mx-1 px-1` is not decoration: a scroll container clips both axes,
              and the avatars sit flush against its left edge with a 2px
              `box-shadow` ring, which would be sliced off. The padding gives the
              ring room and the negative margin cancels it, so nothing moves. */}
          <div
            ref={columnRef}
            className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
          >
            {chain.map((link, index) =>
              hop(
                link,
                index,
                index === 0 ? 'start' : link.id === puzzle.target.id ? 'target' : 'middle',
              ),
            )}
            {!solved && (
              <>
                <UnsolvedHop current={current} />
                <TargetRow target={puzzle.target} />
              </>
            )}
          </div>

          {/* The chain's own footer: a rule and one line, so the column closes on
              the card edge instead of trailing off. */}
          <p className="shrink-0 border-t border-brand-line pt-1.5 text-[11.5px] text-stone-500">
            {result
              ? 'Every hop verified against a shared season.'
              : 'Each name has to share a season with the one above it.'}
          </p>
        </div>
      </div>
    </section>
  );
}
