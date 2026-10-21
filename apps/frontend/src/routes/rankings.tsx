import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { DashboardHeader } from '../components/dashboard/Header';
import { LeaderboardPanel } from '../components/dashboard/LeaderboardPanel';
import { StandingsPanel } from '../components/dashboard/StandingsSidebar';
import { useLeaderboard, useStandings, useTeams } from '../lib/api';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/rankings')({
  // Both views ride in the URL so the back button and a shared link land on the
  // board the reader was looking at.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'leaderboard' ? ('leaderboard' as const) : ('standings' as const),
    board: search.board === 'weighted' ? ('weighted' as const) : ('flat' as const),
  }),
  component: RankingsPage,
});

const TABS = [
  { key: 'standings' as const, label: 'Standings' },
  { key: 'leaderboard' as const, label: 'Leaderboard' },
];

const BOARDS = [
  { key: 'flat' as const, label: 'Flat' },
  { key: 'weighted' as const, label: 'Weighted' },
];

/**
 * Conference standings and both leaderboards on one page.
 *
 * The dashboard keeps them in its xl rails, where a 288px column can scroll on
 * its own. Narrower screens have no rail at all, so this page is the only way
 * to see either — the panels render at full height here and the document does
 * the scrolling.
 */
function RankingsPage() {
  const navigate = useNavigate();
  const { tab, board } = Route.useSearch();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { data: teams } = useTeams({ enabled: !!user });
  const { data: standings, isLoading: standingsLoading } = useStandings();
  const flatBoard = useLeaderboard('flat');
  const weightedBoard = useLeaderboard('weighted');

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user || !user.favoriteTeam) return null;

  const team = teams?.find((t) => t.abbreviation === user.favoriteTeam) ?? null;
  const accentColor = team?.primaryColor ?? '#1C4188';

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  const activeBoard = board === 'weighted' ? weightedBoard : flatBoard;
  const myRow = activeBoard.data?.find((row) => row.userId === user.id) ?? null;

  return (
    <div className="flex-1 bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="rankings"
      />

      <div className="mx-auto w-full max-w-[820px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-heading text-4xl font-black uppercase tracking-wide text-brand-ink">
            <Trophy className="h-8 w-8 text-brand-navy" aria-hidden="true" />
            Rankings
          </h1>
          <p className="text-sm text-stone-500">
            {tab === 'leaderboard'
              ? 'Flat scores every correct pick the same. Weighted pays out like a 1-unit bet at the odds when the pick was made.'
              : 'Every team by conference record, your team highlighted. The dashed line after six is the playoff cut, the solid line after ten ends the play-in.'}
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-brand-line bg-white p-1 shadow-sm sm:max-w-[420px]">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() =>
                navigate({
                  to: '/rankings',
                  search: { tab: option.key, board },
                })
              }
              aria-pressed={tab === option.key}
              className={`rounded-md px-2 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors sm:px-6 sm:text-sm ${
                tab === option.key
                  ? 'bg-brand-navyDark text-white shadow'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {tab === 'leaderboard' ? (
          <div className="flex flex-col gap-4">
            <div className="flex w-full gap-1 rounded-xl border border-brand-line bg-white p-1 shadow-sm sm:max-w-[420px]">
              {BOARDS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/rankings',
                      search: { tab, board: option.key },
                    })
                  }
                  aria-pressed={board === option.key}
                  className={`min-h-[40px] flex-1 rounded-md px-2 text-xs font-bold uppercase tracking-widest transition-colors sm:px-6 ${
                    board === option.key
                      ? 'bg-stone-100 text-brand-ink shadow-sm'
                      : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <LeaderboardPanel
              title={board === 'weighted' ? 'Weighted Leaderboard' : 'Flat Leaderboard'}
              weighted={board === 'weighted'}
              entries={(activeBoard.data ?? []).map((row) => ({
                rank: row.rank,
                name: row.name,
                points: row.points,
              }))}
              userRank={myRow?.rank ?? 0}
              userPoints={myRow?.points ?? 0}
              userName={user.name}
              userColor={team?.primaryColor}
              loading={activeBoard.isLoading}
              scrollable={false}
            />
          </div>
        ) : (
          <StandingsPanel
            selectedAbbr={user.favoriteTeam}
            standings={standings ?? null}
            loading={standingsLoading}
            selectedColor={team?.primaryColor}
          />
        )}
      </div>
    </div>
  );
}
