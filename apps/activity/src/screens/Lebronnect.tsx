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
import { ErrorNote, Spinner } from '../components/kit';

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
        ) : (
          <section className="flex min-h-[19rem] flex-1 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-stone-50 px-4 py-2">
              <span className="font-heading text-[12px] font-bold uppercase tracking-[0.22em] text-brand-navyDark">
                Lebronnect
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-400">
                {failure ? 'Board unavailable' : 'Loading board'}
              </span>
            </div>
            {failure ? (
              <ErrorNote message={failure} />
            ) : (
              <Spinner label="Fetching today’s two players…" />
            )}
          </section>
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
