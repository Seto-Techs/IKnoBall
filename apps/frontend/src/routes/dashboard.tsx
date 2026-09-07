import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isToday } from 'date-fns';
import { Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { DashboardHeader } from '../components/dashboard/Header';
import { StandingsSidebar } from '../components/dashboard/StandingsSidebar';
import { StatCard } from '../components/dashboard/StatCard';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { LeaderboardPanel } from '../components/dashboard/LeaderboardPanel';
import { MonthlyCalendar } from '../components/dashboard/MonthlyCalendar';
import { RecentForm } from '../components/dashboard/RecentForm';
import { StatLeadersPanel } from '../components/dashboard/StatLeaders';
import {
  LeagueWideHeroCarousel,
  computeHero,
} from '../components/dashboard/LeagueWideHeroCarousel';
import { SevenDayStrip } from '../components/dashboard/SevenDayStrip';
import { LeagueLeadersPanel } from '../components/dashboard/LeagueLeadersPanel';
import { PreviousGameDayCard } from '../components/dashboard/PreviousGameDayCard';
import {
  useTeamRecord,
  useUpcomingGames,
  useTopPlayers,
  useStandings,
  useTeams,
  useLeagueGamesRange,
  useLeagueGamesNext,
  useLeagueGamesPrevious,
  useLeagueLeaders,
} from '../lib/api';
import {
  mockAccuracy,
  mockLeaderboard,
  mockUserPoints,
  mockUserPointsWeighted,
  mockUserPredictions,
  mockUserRank,
  mockUserRankNumber,
  mockUserRankWeightedNumber,
  mockWeightedLeaderboard,
} from '../lib/mock-data';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'league' ? ('league' as const) : ('team' as const),
  }),
  component: DashboardPage,
});

function getRangeStrings(): { from: string; to: string } {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const toDate = new Date(now);
  toDate.setDate(now.getDate() + 6);
  const to = toDate.toISOString().slice(0, 10);
  return { from, to };
}

function DashboardPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const favTeam = user?.favoriteTeam ?? null;
  const { data: teams } = useTeams({ enabled: !!user });
  const team = favTeam ? (teams?.find((t) => t.abbreviation === favTeam) ?? null) : null;

  const { data: record, isPending: recordLoading } = useTeamRecord(favTeam ?? undefined);
  const { data: games } = useUpcomingGames(favTeam ?? undefined);
  const { data: players, isLoading: playersLoading } = useTopPlayers(favTeam ?? undefined);
  const { data: standings, isLoading: standingsLoading } = useStandings();

  // League Wide data — always enabled when on league tab, but prefetch anyway for pill switch instant
  const { from, to } = useMemo(() => getRangeStrings(), []);
  const isLeague = tab === 'league';
  const { data: leagueGames, isLoading: leagueGamesLoading } = useLeagueGamesRange(
    from,
    to,
    !!user,
  );
  const { data: leagueNextGames } = useLeagueGamesNext(!!user);
  const { data: previousGames, isLoading: previousGamesLoading } = useLeagueGamesPrevious(!!user);
  const { data: leagueLeaders, isLoading: leagueLeadersLoading } = useLeagueLeaders();

  const heroMeta = useMemo(() => {
    const now = new Date();
    if (leagueGames && leagueGames.length > 0) {
      const h = computeHero(leagueGames, now, 7);
      if (h) return h;
    }
    if (leagueNextGames && leagueNextGames.length > 0) {
      // next is opening day fallback
      const key = leagueNextGames[0]?.gameDate ?? '';
      if (key)
        return {
          dateKey: key,
          date: new Date(`${key}T12:00:00.000Z`),
          games: leagueNextGames,
        } as ReturnType<typeof computeHero>;
    }
    if (leagueGames) return computeHero(leagueGames, now, 180);
    return null;
  }, [leagueGames, leagueNextGames]);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!favTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, favTeam, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user || !favTeam || !team) return null;

  const nextGame = games?.[0] ?? null;
  const liveToday = games?.filter((g) => isToday(new Date(g.gameDateTime))).length ?? 0;
  const leagueLiveToday = leagueGames?.filter((g) => isToday(new Date(g.gameDateTime))).length ?? 0;

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => navigate({ to: '/' }),
    });
  };

  const chooseTeam = () => navigate({ to: '/onboarding' });

  const setTab = (next: 'team' | 'league') => {
    navigate({
      to: '/dashboard',
      search: { tab: next === 'league' ? 'league' : undefined } as never,
    });
  };

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader userName={user.name} onSignOut={handleSignOut} />

      <div className="mx-auto grid max-w-[1920px] grid-cols-1 items-start gap-6 px-6 py-6 xl:grid-cols-[288px_minmax(0,1fr)_288px]">
        <StandingsSidebar
          selectedAbbr={team.abbreviation}
          standings={standings ?? null}
          loading={standingsLoading}
          selectedColor={team.primaryColor}
          className="hidden xl:flex"
        />

        <main className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <StatCard
              icon={<Trophy className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
              label="Leaderboard"
              value={mockUserRank}
              caption="Your Rank"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
              label="Predictions"
              value={`${mockUserPredictions.correct}W ${mockUserPredictions.wrong}L`}
              caption="Correct / Wrong"
            />
            <StatCard
              icon={<Zap className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
              label="Live Today"
              value={isLeague ? leagueLiveToday : liveToday}
              caption="Games"
            />
            <StatCard
              icon={<Target className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
              label="Accuracy"
              value={mockAccuracy}
              caption="This Week"
            />
          </div>

          {/* Block toggle — full width of center column, sits below 4 cards; only center switches */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-brand-line bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('team')}
              className={`rounded-lg px-6 py-3 text-sm font-bold transition-colors ${
                !isLeague
                  ? 'bg-brand-navyDark text-white shadow'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
              }`}
              aria-pressed={!isLeague}
            >
              My Team
            </button>
            <button
              type="button"
              onClick={() => setTab('league')}
              className={`rounded-lg px-6 py-3 text-sm font-bold transition-colors ${
                isLeague
                  ? 'bg-brand-navyDark text-white shadow'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
              }`}
              aria-pressed={isLeague}
            >
              League Wide
            </button>
          </div>

          {isLeague ? (
            <>
              <LeagueWideHeroCarousel
                games={leagueGames}
                nextGames={leagueNextGames}
                teams={teams}
                loading={leagueGamesLoading}
              />
              <PreviousGameDayCard
                games={previousGames}
                teams={teams}
                loading={previousGamesLoading}
              />
              <SevenDayStrip
                games={leagueGames}
                teams={teams}
                heroDateKey={heroMeta?.dateKey ?? null}
                loading={leagueGamesLoading}
              />
              <LeagueLeadersPanel leaders={leagueLeaders ?? null} loading={leagueLeadersLoading} />
            </>
          ) : (
            <>
              <HeroBanner
                team={team}
                record={record}
                nextGame={nextGame}
                onChooseTeam={chooseTeam}
                teams={teams}
              />

              <RecentForm record={record} loading={recordLoading} teams={teams} />

              <StatLeadersPanel players={players} loading={playersLoading} />

              <MonthlyCalendar abbr={team.abbreviation} team={team} teams={teams} />
            </>
          )}
        </main>
        <aside className="hidden h-fit flex-col gap-6 self-start xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain [scrollbar-width:thin] [scrollbar-color:#d6d3d1_transparent]">
          <LeaderboardPanel
            title="Leaderboard"
            entries={mockLeaderboard}
            userRank={mockUserRankNumber}
            userPoints={mockUserPoints}
            userName={user.name}
            userColor={team.primaryColor}
          />
          <LeaderboardPanel
            title="Weighted"
            weighted
            entries={mockWeightedLeaderboard}
            userRank={mockUserRankWeightedNumber}
            userPoints={mockUserPointsWeighted}
            userName={user.name}
            userColor={team.primaryColor}
          />
        </aside>
      </div>
    </div>
  );
}
