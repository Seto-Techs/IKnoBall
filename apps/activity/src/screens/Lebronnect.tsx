import { useEffect, useRef, useState } from 'react';
import { fetchTeams, useResource, type Me } from '../lib/api';
import {
  checkHop,
  clearChainProgress,
  fetchLebronnectMe,
  fetchPuzzle,
  readChainProgress,
  solveChain,
  writeChainProgress,
  type ChainLink,
  type LebronnectResult,
  type PlayerSuggestion,
} from '../lib/lebronnect';
import { SplitHero } from '../components/connect/layouts';
import { HouseRules, HowTo } from '../components/connect/parts';
import { Skeleton } from '../components/kit';

/**
 * The board before it lands.
 *
 * A spinner in the middle of an empty card tells you to wait; a skeleton in the
 * board's own shape tells you what is coming and holds the space, so the card
 * does not jump from a spinner to a two-column board. The blocks follow the real
 * layout — stat strip, navy panel with two faces and the input, then the chain —
 * which is why they are sized here rather than reused from a generic row.
 */
function BoardSkeleton() {
  return (
    <section
      aria-busy
      className="flex min-h-[19rem] flex-1 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-brand-line bg-stone-50 px-4 py-2">
        <Skeleton className="h-3 w-24 rounded bg-stone-200" />
        <Skeleton className="h-3 w-10 rounded bg-stone-200" />
        <Skeleton className="ml-auto h-3 w-16 rounded bg-stone-200" />
      </div>

      <div className="grid min-h-0 flex-1 sm:grid-cols-[minmax(0,16.5rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 bg-brand-navyDark px-4 py-3.5">
          <div className="flex w-full items-start gap-2">
            <div className="flex flex-1 flex-col items-start gap-1.5">
              <Skeleton className="h-[58px] w-[58px] rounded-full bg-white/10" />
              <Skeleton className="h-3 w-20 rounded bg-white/10" />
            </div>
            <Skeleton className="mt-6 h-4 w-4 rounded bg-white/10" />
            <div className="flex flex-1 flex-col items-end gap-1.5">
              <Skeleton className="h-[58px] w-[58px] rounded-full bg-white/10" />
              <Skeleton className="h-3 w-20 rounded bg-white/10" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <Skeleton className="h-11 w-full rounded-lg bg-white/10" />
            <Skeleton className="mt-1.5 h-3 w-40 rounded bg-white/10" />
          </div>
        </div>

        <div className="flex flex-col gap-1 px-4 py-2.5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="h-[42px] w-[42px] rounded-full bg-stone-200" />
              <Skeleton className="h-3.5 w-32 rounded bg-stone-200" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Lebronnect: the daily teammate chain.
 *
 * The board, the link checks and the grade all come from `/minigames/lebronnect`,
 * so the client never decides whether two players were teammates and never learns
 * how few players a solve takes until the chain is done. A finished day restores
 * from the server; an unfinished one restores from this browser, keyed by the
 * viewer and the board's date.
 */
export function Lebronnect({ me }: { me: Me }) {
  const puzzle = useResource(fetchPuzzle);
  const record = useResource(fetchLebronnectMe);
  const teams = useResource(fetchTeams);

  const [chain, setChain] = useState<ChainLink[] | null>(null);
  const [result, setResult] = useState<LebronnectResult | null>(null);
  // The day the board was seeded from. Re-seeding on every render would throw
  // away a chain in progress, so it happens once per puzzle date.
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!puzzle.data || record.loading || !record.data) return;
    if (seeded.current === puzzle.data.date) return;
    seeded.current = puzzle.data.date;

    if (record.data.result) {
      // The day's record is authoritative, so it wins over anything left in this
      // browser — and the local copy has no further purpose once it is here.
      clearChainProgress(me.id, puzzle.data.date);
      setResult(record.data.result);
      setChain(
        record.data.result.chain.map((link) => ({
          id: link.playerId,
          externalId: link.externalId,
          name: link.name,
          receipt: link.receipt,
        })),
      );
      return;
    }

    setResult(null);
    // An unfinished chain survives a reload on this browser; yesterday's, or
    // another account's, is never read back.
    setChain(
      readChainProgress(me.id, puzzle.data.date, puzzle.data.start.id) ?? [
        {
          id: puzzle.data.start.id,
          externalId: puzzle.data.start.externalId,
          name: puzzle.data.start.name,
          receipt: [],
        },
      ],
    );
  }, [puzzle.data, record.loading, record.data, me.id]);

  /**
   * One guess, in two steps the server owns: ask whether the two players shared
   * a team-season, then — only if the pick was the target — submit the whole
   * chain for grading. A rejection costs nothing and changes nothing.
   */
  async function pick(player: PlayerSuggestion): Promise<string | null> {
    if (!puzzle.data || !chain) return 'The board is still loading.';

    const from = chain[chain.length - 1];
    if (chain.some((link) => link.id === player.id)) {
      return `${player.name} is already in your chain.`;
    }

    try {
      const checked = await checkHop(from.id, player.id);
      if (!checked.linked) {
        return `${player.name} and ${from.name} never shared a team-season. Try someone else.`;
      }

      let next: ChainLink[] = [
        ...chain,
        {
          id: player.id,
          externalId: player.externalId,
          name: player.name,
          receipt: checked.receipt,
        },
      ];

      // The target is an endpoint, not a player the user should have to guess.
      // Once their last intermediary shares a team-season with it, close the
      // chain automatically.
      if (player.id !== puzzle.data.target.id) {
        const targetHop = await checkHop(player.id, puzzle.data.target.id);
        if (targetHop.linked) {
          next = [
            ...next,
            {
              id: puzzle.data.target.id,
              externalId: puzzle.data.target.externalId,
              name: puzzle.data.target.name,
              receipt: targetHop.receipt,
            },
          ];
        }
      }

      const reachedTarget = next[next.length - 1]?.id === puzzle.data.target.id;
      if (reachedTarget) {
        const graded = await solveChain(next.map((link) => link.id));
        // The server returns the day's recorded result, which is this chain on a
        // first solve and the earlier one on a replay. Adopt it so the rows on
        // screen always match the grade beside them.
        setResult(graded);
        setChain(
          graded.chain.map((link) => ({
            id: link.playerId,
            externalId: link.externalId,
            name: link.name,
            receipt: link.receipt,
          })),
        );
        clearChainProgress(me.id, puzzle.data.date);
      } else {
        setChain(next);
        writeChainProgress(me.id, puzzle.data.date, next);
      }
      return null;
    } catch (error) {
      // The API reviews every hop again on submit, so its message is the one
      // worth showing when a chain the client thought was fine gets refused.
      return error instanceof Error ? error.message : 'That link could not be checked.';
    }
  }

  // The receipt badge is the club's real mark, so the chain needs the roster of
  // clubs the rest of the app already loads. No request of its own.
  const clubOf = (abbreviation: string) => {
    const club = teams.data?.find((entry) => entry.abbreviation === abbreviation);
    return club ? { logoUrl: club.logoUrl, primaryColor: club.primaryColor } : undefined;
  };

  const failure = puzzle.error ?? record.error;

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
        {puzzle.data && chain ? (
          <SplitHero
            puzzle={puzzle.data}
            chain={chain}
            result={result}
            onPick={pick}
            clubOf={clubOf}
          />
        ) : failure ? (
          <section className="flex min-h-[19rem] flex-1 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-stone-50 px-4 py-2">
              <span className="font-heading text-[12px] font-bold uppercase tracking-[0.22em] text-brand-navyDark">
                Lebronnect
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-400">
                Board unavailable
              </span>
            </div>
            {/* A failed board is a dead end otherwise: nothing on this screen
                refetches, so the only way back would be closing the activity. */}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
              <p className="text-sm font-medium leading-snug text-brand-red">{failure}</p>
              <button
                type="button"
                onClick={() => {
                  puzzle.reload();
                  record.reload();
                }}
                className="rounded-md bg-brand-navy px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-navyDark"
              >
                Try again
              </button>
            </div>
          </section>
        ) : (
          <BoardSkeleton />
        )}

        {/* The card fills the window, so the reference panels sit under it — the
            place the site puts them, and the place a player looks once the chain
            has them stuck. */}
        <div className="grid shrink-0 gap-3 md:grid-cols-2">
          <HowTo />
          <HouseRules />
        </div>
      </div>
    </div>
  );
}
