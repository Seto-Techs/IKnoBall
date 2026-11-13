import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { SplitHero } from '../components/connect/layouts';
import { HouseRules, HowTo } from '../components/connect/parts';
import {
  clearChainProgress,
  readChainProgress,
  useLebronnectHop,
  useLebronnectMe,
  useLebronnectPuzzle,
  useLebronnectSolve,
  writeChainProgress,
  type ChainLink,
  type LebronnectResult,
  type PlayerSuggestion,
} from '../lib/use-lebronnect';
import { useTeams } from '../lib/api';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/games_/lebronnect')({
  component: LebronnectPage,
});

/**
 * LeBronnect: the daily teammate chain.
 *
 * The board, the link checks and the grade all come from `/minigames/lebronnect`,
 * so the client never decides whether two players were teammates and never
 * learns how few players a solve takes until the chain is done. Reloading the
 * page restores the day's finished chain from the server, or an unfinished one
 * from this browser.
 */
function LebronnectPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { data: teams } = useTeams({ enabled: !!user });
  const { data: puzzle, isLoading: puzzleLoading } = useLebronnectPuzzle();
  const me = useLebronnectMe(!!user);
  const hop = useLebronnectHop();
  const solve = useLebronnectSolve();

  const [chain, setChain] = useState<ChainLink[] | null>(null);
  const [result, setResult] = useState<LebronnectResult | null>(null);
  // The day the board was seeded from. Re-seeding on every refetch would throw
  // away a chain in progress, so it happens once per puzzle date.
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  useEffect(() => {
    // Wait for the viewer and their record too: seeding from the puzzle alone
    // would make a solved board look unplayed for the length of one request, and
    // a saved chain is keyed by the viewer.
    if (!user || !puzzle || me.isLoading || seeded.current === puzzle.date) return;
    seeded.current = puzzle.date;

    if (me.data?.result) {
      // The day's record is authoritative, so it wins over anything left in this
      // browser — and the local copy has no further purpose once it is here.
      clearChainProgress(user.id, puzzle.date);
      setResult(me.data.result);
      setChain(
        me.data.result.chain.map((link) => ({
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
      readChainProgress(user.id, puzzle.date, puzzle.start.id) ?? [
        {
          id: puzzle.start.id,
          externalId: puzzle.start.externalId,
          name: puzzle.start.name,
          receipt: [],
        },
      ],
    );
  }, [user, puzzle, me.isLoading, me.data]);

  /**
   * One guess, in two steps the server owns: ask whether the two players shared
   * a team-season, then — only if the pick was the target — submit the whole
   * chain for grading. A rejection costs nothing and changes nothing.
   */
  async function pick(player: PlayerSuggestion): Promise<string | null> {
    if (!puzzle || !chain || !user) return 'The board is still loading.';

    const from = chain[chain.length - 1];
    if (chain.some((link) => link.id === player.id)) {
      return `${player.name} is already in your chain.`;
    }

    try {
      const checked = await hop.mutateAsync({ from: from.id, to: player.id });
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
      // chain automatically. This lets a valid path such as Will Riley →
      // Anthony Davis → Russell Westbrook → Steven Adams finish on Westbrook.
      if (player.id !== puzzle.target.id) {
        const targetHop = await hop.mutateAsync({ from: player.id, to: puzzle.target.id });
        if (targetHop.linked) {
          next = [
            ...next,
            {
              id: puzzle.target.id,
              externalId: puzzle.target.externalId,
              name: puzzle.target.name,
              receipt: targetHop.receipt,
            },
          ];
        }
      }

      const reachedTarget = next[next.length - 1]?.id === puzzle.target.id;
      if (reachedTarget) {
        const graded = await solve.mutateAsync(next.map((link) => link.id));
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
        // The server holds the day's chain now, so the local copy is retired.
        clearChainProgress(user.id, puzzle.date);
      } else {
        // Don't render an appended target while the unresolved board still
        // renders its separate target anchor; otherwise it briefly appears twice.
        setChain(next);
        // Save the chain so leaving the page does not lose it.
        writeChainProgress(user.id, puzzle.date, next);
      }
      return null;
    } catch (error) {
      // The API reviews every hop again on submit, so its message is the one
      // worth showing when a chain the client thought was fine gets refused.
      return error instanceof Error ? error.message : 'That link could not be checked.';
    }
  }

  if (sessionLoading || sessionFetching) return null;
  if (!user || !user.favoriteTeam) return null;

  const team = teams?.find((entry) => entry.abbreviation === user.favoriteTeam) ?? null;
  const accentColor = team?.primaryColor ?? '#1C4188';

  // The receipt badge is the club's real mark, so the chain needs the roster of
  // clubs the rest of the site already loads. No request of its own.
  const clubOf = (abbreviation: string) =>
    teams?.find((entry) => entry.abbreviation === abbreviation);

  return (
    <div className="flex-1 bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={() => signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) })}
        active="games"
      />

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/games"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy transition-colors hover:text-brand-navyDark"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Mini games
            </Link>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
              Daily · resets at midnight ET
            </span>
          </div>

          {puzzle && chain ? (
            <SplitHero
              puzzle={puzzle}
              chain={chain}
              result={result}
              onPick={pick}
              clubOf={clubOf}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-brand-line bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-stone-50 px-5 py-2.5">
                <span className="font-heading text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navyDark">
                  LeBronnect
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                  Loading board
                </span>
              </div>
              <div className="px-6 py-10 text-center text-sm text-stone-500">
                {puzzleLoading
                  ? "Fetching today's two players…"
                  : "Today's board could not be loaded."}
              </div>
            </div>
          )}

          {/* The card is short — two rows and an input — so the reference panels
              sit under it rather than leaving the lower half of the page blank. */}
          <div className="grid gap-4 md:grid-cols-2">
            <HowTo />
            <HouseRules />
          </div>
        </div>
      </div>
    </div>
  );
}
