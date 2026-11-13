import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../profile/parts';
import {
  headshotUrl,
  type ChainLink,
  type LebronnectPuzzle,
  type LebronnectResult,
  type PlayerSuggestion,
} from '../../lib/use-lebronnect';
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
 * Density rules, borrowed from every chain game that doesn't read hollow:
 * a stat strip across the top, a row per link carrying the player at one end and
 * the receipt on the connector that joins it to the row above, and the input
 * docked in the panel where the matchup lives. A vertical spine runs down the
 * column through every connector, so the chain reads as one object rather than
 * as a list. */

/** A section of the vertical spine. Stretches between the avatars above and below. */
function SplitConnector({
  children,
  dashed,
  grow,
  fill,
}: {
  children?: ReactNode;
  dashed?: boolean;
  /** Take the column's leftover height — the unknown link stretches to fill it. */
  grow?: boolean;
  /** On desktop the spine absorbs the slack instead of the rows, so a short
      chain still spans the panel rather than leaving a hole under it. */
  fill?: boolean;
}) {
  return (
    <div
      className={`flex items-stretch gap-3 ${grow ? 'min-h-16 flex-1' : ''} ${fill ? 'lg:flex-1' : ''}`}
    >
      <span className="flex w-[52px] shrink-0 justify-center" aria-hidden>
        <span
          className={
            dashed
              ? '-my-2 w-0 self-stretch border-l border-dashed border-stone-300'
              : '-my-1 w-px self-stretch bg-brand-line'
          }
        />
      </span>
      <div
        className={`flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1 ${
          grow ? 'items-end py-1.5' : 'items-center'
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <Avatar
        name={link.name}
        image={headshotUrl(link.externalId)}
        size={56}
        className={
          role === 'start'
            ? 'ring-2 ring-brand-navyDark'
            : role === 'target'
              ? 'ring-2 ring-basketball-500'
              : 'ring-2 ring-basketball-400'
        }
      />
      <p className="min-w-0 max-w-full shrink truncate font-heading text-[22px] font-semibold uppercase leading-tight tracking-wide text-brand-ink">
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
 * Past this many nodes — the start and the target included — the column becomes
 * a window: the ends stay put and the players between them scroll. At five or
 * fewer the chain is short enough to read in one go, so it is left alone.
 */
const CHAIN_WINDOW_AFTER = 5;

/** How far the content fades out at a clipped edge of the window: enough to
    show the column continues, shallow enough that the row under it stays
    legible while it is half scrolled in. */
const CHAIN_WINDOW_FADE = 12;

/**
 * The window's edges and its scrollbar. The edges carry no rule of their own:
 * a hairline would sit there even with nothing above it to hide, so the fades
 * below are the only thing that marks a clipped end. The bar is thin and quiet
 * so it reads as chrome. `scrollbar-gutter` reserves the bar's width up front,
 * so the rows never move when the bar appears; the negative right margin hands
 * that width back to the card's padding, which keeps the connector rules of the
 * scrolling rows ending on the same line as the pinned ones.
 */
const CHAIN_WINDOW_CLASS = [
  'max-h-[22rem] overflow-y-auto overscroll-contain',
  '-mr-1.5 [scrollbar-gutter:stable]',
  // Chromium drops the ::-webkit-scrollbar rules below the moment the standard
  // `scrollbar-width`/`scrollbar-color` properties are set, so the bar is styled
  // through the pseudo-elements alone: thin, quiet, and with no arrow buttons.
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full',
  '[&::-webkit-scrollbar-thumb]:bg-stone-300 [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-button]:hidden',
].join(' ');

/**
 * The open end of an unsolved chain: the dashed hop to a target not yet reached.
 * It rides with whatever is below it, so inside the window it scrolls and below
 * a short chain it takes the column's slack — the dashed line then runs down to
 * the target instead of leaving a blank panel under the last row.
 */
function UnsolvedHop({ current, grow }: { current?: ChainLink; grow?: boolean }) {
  return (
    <SplitConnector dashed grow={grow}>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm border border-dashed border-stone-300 px-1 font-heading text-[10px] font-bold leading-none text-stone-500">
        ?
      </span>
      <span className="text-[11px] text-stone-500">
        Your pick
        {current ? ` — anyone who shared a team with ${current.name}` : null}
      </span>
    </SplitConnector>
  );
}

/** The target, still out of reach: the end the whole chain is aiming at. */
function TargetRow({ target }: { target: LebronnectPuzzle['target'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
      <Avatar
        name={target.name}
        image={headshotUrl(target.externalId)}
        size={52}
        className="ring-2 ring-basketball-500 opacity-80"
      />
      <p className="min-w-0 flex-1 truncate font-heading text-xl font-semibold uppercase leading-tight tracking-wide text-stone-500">
        {target.name}
      </p>
      <Tag tone="orange">Target</Tag>
    </div>
  );
}

export function SplitHero(props: SplitHeroProps) {
  const { puzzle, chain, result, onPick, clubOf } = props;
  const solved = result !== null;
  const current = chain[chain.length - 1];
  const count = solved ? result.players : intermediaryCount(chain, false);

  // The target counts even while the chain is open: its anchor is a node on
  // screen either way, so a board that will need six rows starts scrolling at
  // the same length whether it is finished or not.
  const nodes = chain.length + (solved ? 0 : 1);
  const windowed = nodes > CHAIN_WINDOW_AFTER;

  // The fades mark the edges that are actually clipping something. They lift at
  // the ends of the window, so nothing is dimmed once it has been reached —
  // least of all the target an open board is still aiming at.
  const [clip, setClip] = useState({ above: false, below: false });
  const windowRef = useRef<HTMLDivElement | null>(null);
  const measureClip = () => {
    const el = windowRef.current;
    if (!el) return;
    const above = el.scrollTop > 4;
    const below = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
    setClip((prev) => (prev.above === above && prev.below === below ? prev : { above, below }));
  };
  // A new hop changes the window's height, so its edges are measured again after
  // the chain grows or the board is graded — otherwise a fade can outlive the
  // content it was hiding.
  useEffect(measureClip, [nodes]);

  /* The window's edges fade the content into the card rather than laying a
     band over it: a white band can only bury what is shorter than the band, so
     a clipped badge poked out under it as a ghost. Masking fades the row itself,
     which works for any height, and it is only applied to an edge that is
     actually clipping something — scroll to the end and the target is untouched. */
  const maskStops: string[] = [];
  if (clip.above) maskStops.push('transparent 0px', `black ${CHAIN_WINDOW_FADE}px`);
  else maskStops.push('black 0px');
  if (clip.below) maskStops.push(`black calc(100% - ${CHAIN_WINDOW_FADE}px)`, 'transparent 100%');
  else maskStops.push('black 100%');
  const windowMask =
    clip.above || clip.below ? `linear-gradient(to bottom, ${maskStops.join(', ')})` : undefined;

  /** A row and the connector that joins it to the row above. The connector rides
      with the row it introduces, so the spine stays aligned when a long chain
      scrolls under its pinned ends. */
  const hop = (link: ChainLink, index: number, role: ChainRole, stretch: boolean) => (
    <div
      key={`${link.id}-${index}`}
      className={index > 0 ? `flex flex-col${stretch ? ' lg:flex-1' : ''}` : undefined}
    >
      {/* The receipt sits on the connector, between the player above and this
          one: the badge is the link, not a label at the end of a band. The rule
          then runs on to the card edge so the connector still spans the column. */}
      {index > 0 && (
        <SplitConnector fill={stretch}>
          <ReceiptLine receipt={link.receipt} clubOf={clubOf} />
        </SplitConnector>
      )}
      <ChainRow link={link} role={role} />
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-brand-line bg-white">
      {/* Stat strip. One row, always present, so the card has a top edge and the
          score is visible without hunting for it — the genre's one universal
          piece of chrome. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-brand-line bg-stone-50 px-5 py-2.5">
        <span className="font-heading text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navyDark">
          LeBronnect
        </span>
        <span className="text-stone-300">·</span>
        <span className="font-heading text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
          #{puzzle.number}
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-xs font-semibold text-stone-600">
          {new Date(`${puzzle.date}T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-xs text-stone-500">Modern pool</span>
        <span className="ml-auto inline-flex items-baseline gap-1.5">
          <span className="font-heading text-lg font-bold leading-none text-brand-navyDark">
            {count}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
            {count === 1 ? 'player in' : 'players in'}
          </span>
        </span>
      </div>

      {/* The panel is the hero, so it takes a third of the card at the widest
          widths — that also pulls the chain column down to the 640–720px band
          the genre's rows live in, instead of 780px of air per band. */}
      <div className="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 bg-brand-navyDark px-6 py-6 text-white lg:justify-between">
          {/* Faces above each name, so the matchup reads as two people rather
              than two strings — and the two are the largest objects in the
              panel, which is what stops it reading as a form. */}
          <div className="flex w-full items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <Avatar
                name={puzzle.start.name}
                image={headshotUrl(puzzle.start.externalId)}
                size={80}
                className="ring-2 ring-white/40"
              />
              <p className="font-heading text-[19px] font-semibold uppercase leading-[1.05] tracking-wide">
                {puzzle.start.name}
              </p>
            </div>
            <ArrowRight className="mt-9 h-4 w-4 shrink-0 text-brand-orange" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col items-end gap-2 text-right">
              <Avatar
                name={puzzle.target.name}
                image={headshotUrl(puzzle.target.externalId)}
                size={80}
                className="ring-2 ring-basketball-400"
              />
              <p className="font-heading text-[19px] font-semibold uppercase leading-[1.05] tracking-wide">
                {puzzle.target.name}
              </p>
            </div>
          </div>

          {result ? (
            /* The finish, in the panel where the matchup lived: two numerals,
               yours and the floor's, side by side, then the actions. Same
               visual language as the strip, so the result is a number rather
               than a paragraph. */
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {result.perfect ? 'Perfect' : 'Solved'}
              </p>
              <div className="mt-2 flex items-end gap-5">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-[56px] font-bold leading-[0.85]">
                    {result.players}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    you
                  </span>
                </span>
                <span className="mb-2 h-11 w-px bg-white/20" aria-hidden />
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-[56px] font-bold leading-[0.85] text-brand-gold">
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
               two-row chain reads as breathing room around the field rather
               than a hole between the matchup and the footer. */
            <div className="flex flex-col lg:flex-1 lg:justify-center">
              <GuessBox
                current={current}
                exclude={chain.map((link) => link.id)}
                onPick={onPick}
                tone="dark"
              />
            </div>
          )}

          {/* Footer of the panel: the rule that keeps the game hard, stated
              once. It also gives the panel a bottom edge when the chain on the
              right is taller than the matchup and the input. */}
          <p className="border-t border-white/10 pt-3 text-[10.5px] leading-relaxed text-slate-400">
            {result
              ? 'Every name you added was one player. The start and the target never count.'
              : 'Every name you add is one player. The start and the target never count.'}
          </p>
        </div>

        <div className="flex flex-col px-6 py-4">
          {windowed ? (
            <>
              {/* The ends of a long chain stay in view: the start here, the
                  target under the window. Everything between them scrolls, each
                  player with the connector that joins it to the row above — the
                  target's connector included, so the spine runs into the pinned
                  target instead of being sliced off at the window's edge. */}
              {hop(chain[0], 0, 'start', false)}
              <div
                className={CHAIN_WINDOW_CLASS}
                ref={(el) => {
                  windowRef.current = el;
                  measureClip();
                }}
                onScroll={measureClip}
                style={{ maskImage: windowMask, WebkitMaskImage: windowMask }}
              >
                {chain
                  .slice(1, solved ? -1 : undefined)
                  .map((link, index) => hop(link, index + 1, 'middle', false))}
                {!solved && <UnsolvedHop current={current} />}
                {solved && (
                  <SplitConnector>
                    <ReceiptLine receipt={chain[chain.length - 1].receipt} clubOf={clubOf} />
                  </SplitConnector>
                )}
              </div>
              {solved ? (
                <ChainRow link={chain[chain.length - 1]} role="target" />
              ) : (
                <TargetRow target={puzzle.target} />
              )}
            </>
          ) : (
            <>
              {chain.map((link, index) =>
                hop(
                  link,
                  index,
                  index === 0 ? 'start' : link.id === puzzle.target.id ? 'target' : 'middle',
                  true,
                ),
              )}
              {!solved && (
                <>
                  <UnsolvedHop current={current} grow />
                  <TargetRow target={puzzle.target} />
                </>
              )}
            </>
          )}

          {/* The chain's own footer: a rule and one line, so the column closes on
              the card edge instead of trailing off. Slack goes into the spine
              above (the connectors grow), never into a gap here. */}
          <p className="border-t border-brand-line pt-3 text-[11px] text-stone-500">
            {result
              ? 'Every hop verified against a shared season.'
              : 'Each name has to share a season with the one above it.'}
          </p>
        </div>
      </div>
    </div>
  );
}
