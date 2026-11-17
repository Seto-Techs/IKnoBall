import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, Search } from 'lucide-react';
import { Avatar, Panel } from '../kit';
import {
  headshotUrl,
  playerLabel,
  searchPlayers,
  type ChainLink,
  type LebronnectGrade,
  type LebronnectResult,
  type PlayerSuggestion,
  type Receipt,
} from '../../lib/lebronnect';

/**
 * The chain game's furniture, ported from the site so the activity and the web
 * board are the same game seen twice: the same receipts, the same five-block
 * grade, the same input. Only the scale is smaller — a Discord window is about
 * 390px tall in landscape, so every metric here is tuned down a step while the
 * type stays readable.
 */

/**
 * Players *you* named. The start is the puzzle's, not yours, so it never counts;
 * a finished chain also ends on the target, which is the puzzle's too.
 */
export function intermediaryCount(links: ChainLink[], solved: boolean) {
  return Math.max(0, links.length - (solved ? 2 : 1));
}

export function Tag({
  tone,
  children,
}: {
  tone: 'navy' | 'orange' | 'muted';
  children: ReactNode;
}) {
  const tones = {
    navy: 'bg-brand-navy text-white',
    orange: 'bg-basketball-500 text-white',
    muted: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
  } as const;

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** What a receipt needs to draw a club's own mark: the logo, and the colour to sit it on. */
export type ClubMark = { logoUrl?: string | null; primaryColor?: string | null };

/** Abbreviation → club, so a receipt can draw a real badge instead of a coloured word. */
export type ClubLookup = (abbreviation: string) => ClubMark | undefined;

/**
 * A receipt's seasons as one label: `2021-22`, or `2019-22` when the spell runs
 * straight through.
 */
export function seasonRun(seasons: string[]): string {
  if (seasons.length === 0) return '';
  if (seasons.length === 1) return seasons[0];

  const start = seasons[0];
  const end = seasons[seasons.length - 1];
  const spans = seasons.every((season, index) => {
    if (index === 0) return true;
    return Number(season.slice(0, 4)) === Number(seasons[index - 1].slice(0, 4)) + 1;
  });

  return spans ? `${start.slice(0, 5)}${end.slice(-2)}` : `${start.slice(0, 4)}–${end.slice(-2)}`;
}

/**
 * One receipt: the club's badge, then the seasons. The badge is the club's real
 * logo on a white plate ringed in its own colour, because a receipt is a fact
 * about two players and a wordmark in a coloured box reads as decoration.
 */
export function ReceiptPill({ row, club }: { row: Receipt; club?: ClubMark }) {
  const colour = club?.primaryColor ?? '#64748B';
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white py-[2px] pl-[2px] pr-2 shadow-sm">
      <span
        className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-white ring-2"
        style={{ '--tw-ring-color': colour } as CSSProperties}
        title={row.team}
      >
        {club?.logoUrl ? (
          <img
            src={club.logoUrl}
            alt={row.team}
            loading="lazy"
            className="h-[17px] w-[17px] object-contain"
          />
        ) : (
          <span
            className="font-heading text-[9px] font-bold tracking-wide"
            style={{ color: colour }}
          >
            {row.team}
          </span>
        )}
      </span>
      <span className="whitespace-nowrap text-[11.5px] font-semibold tabular-nums text-stone-700">
        {seasonRun(row.seasons)}
      </span>
    </span>
  );
}

/**
 * The link between two rows: the badge sits on the rule exactly where the two
 * players meet, and the rule runs on to the card edge so the row still spans
 * the column.
 */
export function ReceiptLine({ receipt, clubOf }: { receipt: Receipt[]; clubOf?: ClubLookup }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {receipt.map((row) => (
        <ReceiptPill key={row.team} row={row} club={clubOf?.(row.team)} />
      ))}
      <span className="h-px min-w-2 flex-1 bg-brand-line" aria-hidden />
    </span>
  );
}

/**
 * The grade, as five blocks — the shape Wordle players already read as a score,
 * counting the other way: a full five is par and each player over takes one
 * away. The colour carries the judgement on top of the count.
 */
export function ScoreMeter({
  rating,
  label,
  tone = 'dark',
}: {
  rating: LebronnectGrade;
  label: string;
  tone?: 'dark' | 'light';
}) {
  const grade = gradeTone(rating);
  const empty = tone === 'light' ? 'border border-stone-300' : 'border border-white/30';
  return (
    <div className="flex items-center gap-1" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`h-3.5 w-3.5 rounded-[3px] ${step <= rating ? grade.fill : empty}`}
          aria-hidden
        />
      ))}
    </div>
  );
}

/** One place decides what a rating looks like, so the share string says the same thing. */
function gradeTone(rating: LebronnectGrade) {
  if (rating === 5) return { fill: 'bg-brand-gold', block: '🟨', empty: '⬜' };
  if (rating === 4) return { fill: 'bg-basketball-400', block: '🟧', empty: '⬜' };
  if (rating === 3) return { fill: 'bg-basketball-700', block: '🟫', empty: '⬜' };
  if (rating === 2) return { fill: 'bg-brand-red', block: '🟥', empty: '⬜' };
  return { fill: 'bg-slate-400', block: '⬛', empty: '⬜' };
}

/** `Par` / `Off by 2` / `Off by 3+` — the label that goes with the blocks. */
export function gradeLabel(players: number, par: number) {
  const over = players - par;
  if (over <= 0) return 'Par';
  return over > 3 ? 'Off by 3+' : `Off by ${over}`;
}

/* ── Guess box ─────────────────────────────────────────────────
 * One control. Matching, validation and the rejection copy come from the API;
 * this only decides when to ask and what to do with the answer.
 */

export function GuessBox({
  current,
  exclude,
  onPick,
}: {
  /** The player the chain is standing on — whose teammates you may name. */
  current: ChainLink | undefined;
  exclude: string[];
  /** Resolves to a rejection message, or null when the hop was accepted. */
  onPick: (player: PlayerSuggestion) => Promise<string | null>;
}) {
  const [query, setQuery] = useState('');
  // The graph holds ~800 names, so a keystroke does not need a round trip; 180ms
  // is long enough that a typed name is one request instead of five.
  const [needle, setNeedle] = useState('');
  const [matches, setMatches] = useState<PlayerSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  // A rejected guess keeps its text so the player can fix a typo, but the list
  // has to close or it covers the message explaining the rejection.
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setNeedle(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (needle.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    searchPlayers(needle)
      .then((rows) => {
        if (alive) {
          setMatches(rows);
          setSearching(false);
        }
      })
      .catch(() => {
        if (alive) {
          setMatches([]);
          setSearching(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [needle]);

  const suggestions = useMemo(
    () => matches.filter((player) => !exclude.includes(player.id)),
    [matches, exclude],
  );
  const open = listOpen && needle.trim().length >= 2;

  async function choose(player: PlayerSuggestion) {
    if (!current || pending) return;

    if (exclude.includes(player.id)) {
      setError(`${player.name} is already in your chain.`);
      setListOpen(false);
      return;
    }

    setPending(true);
    const reason = await onPick(player);
    setPending(false);

    if (reason) {
      setError(reason);
      setListOpen(false);
      return;
    }

    setError(null);
    setQuery('');
    setNeedle('');
    setActive(0);
    setListOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setError(null);
            setListOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, suggestions.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === 'Enter' && suggestions[active]) {
              event.preventDefault();
              void choose(suggestions[active]);
            }
            if (event.key === 'Escape') {
              setQuery('');
              setListOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="connect-suggestions"
          aria-autocomplete="list"
          aria-label={`Name a player who was a teammate of ${current?.name ?? 'the last player'}`}
          placeholder={`Teammate of ${current?.name.split(' ').pop() ?? '…'}`}
          className={`h-11 w-full rounded-lg border bg-white/5 pl-9 pr-3 text-[15px] text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-400 focus:ring-red-400/40'
              : 'border-white/25 focus:border-white/60 focus:ring-white/25'
          }`}
        />

        {open && suggestions.length > 0 && (
          <ul
            id="connect-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
          >
            {suggestions.map((player, index) => (
              <li key={player.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => void choose(player)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    index === active ? 'bg-brand-cream' : 'bg-white'
                  }`}
                >
                  <Avatar
                    name={player.name}
                    image={headshotUrl(player.externalId)}
                    size={30}
                    className="ring-1 ring-stone-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-brand-ink">
                      {player.name}
                    </span>
                    <span className="block text-[11px] text-stone-500">{player.seasons}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={`mt-1.5 text-[12px] leading-snug ${error ? 'text-red-300' : 'text-slate-300'}`}>
        {error ??
          (pending
            ? 'Checking that link…'
            : open && searching
              ? 'Searching…'
              : 'Any real teammate link counts. Wrong guesses are free.')}
      </p>
    </div>
  );
}

/* ── Result ────────────────────────────────────────────────── */

/**
 * The finish lives in the navy panel, where the matchup was — the scoreboard
 * panel becomes the result instead of a cream box appearing beside it.
 */
export function SolvedActions({ result }: { result: LebronnectResult }) {
  const [copied, setCopied] = useState(false);
  const grade = gradeLabel(result.players, result.par);

  async function copy() {
    const tone = gradeTone(result.blocks);
    const text = [
      `IKnoBall LeBronnect · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      `${tone.block.repeat(result.blocks)}${tone.empty.repeat(5 - result.blocks)}  ${grade} · ${playerLabel(result.players)} · best ${playerLabel(result.par)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-t border-white/10 pt-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ScoreMeter rating={result.blocks} label={grade} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
          {grade}
        </span>
      </div>

      {/* The floor stays hidden all game and lands here, after the chain is done:
          it grades the solve instead of being a target to count down to. */}
      <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
        Best solution is {playerLabel(result.par)}
        {result.best ? ' — the route is below.' : '.'}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-navyDark transition-colors hover:bg-brand-cream"
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy result'}
        </button>
        {/* No replay: the first result of the day is the one that counts. */}
        <span className="px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Locked for today
        </span>
      </div>

      {result.best && result.best.length > 1 && (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Best connection
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-300 [text-wrap:pretty]">
            {result.best.map((link) => link.name).join(' → ')}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Reference panels ──────────────────────────────────────── */

export function HowTo() {
  return (
    <Panel title="How to play">
      <ol className="space-y-2 px-4 py-3 text-[13.5px] leading-relaxed text-stone-600">
        <li className="flex gap-2">
          <span className="font-heading font-bold text-brand-orange">1</span>
          Name anyone who shared a team with the player you are standing on.
        </li>
        <li className="flex gap-2">
          <span className="font-heading font-bold text-brand-orange">2</span>
          Your pick becomes the new current player. Every link shows where and when they shared a
          team.
        </li>
        <li className="flex gap-2">
          <span className="font-heading font-bold text-brand-orange">3</span>
          Reach the target. How few it can be done in stays hidden until you finish.
        </li>
      </ol>
    </Panel>
  );
}

export function HouseRules() {
  return (
    <Panel title="House rules">
      <ul className="space-y-2 px-4 py-3 text-[13.5px] leading-relaxed text-stone-600">
        <li className="border-l-2 border-basketball-400 pl-2.5">
          <span className="font-semibold text-brand-ink">Any real link counts.</span> No answer
          pool, no ban list — a ten-day contract is a teammate.
        </li>
        <li className="border-l-2 border-brand-line pl-2.5">
          <span className="font-semibold text-brand-ink">No target number.</span> The best solution
          is hidden until you solve — you find out how you did, not what to aim for.
        </li>
        <li className="border-l-2 border-brand-line pl-2.5">
          <span className="font-semibold text-brand-ink">No hints.</span> Nobody hands you a
          teammate — the chain is the whole game.
        </li>
      </ul>
    </Panel>
  );
}
