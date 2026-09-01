import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isToday } from 'date-fns';
import { Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { DashboardHeader } from '../components/dashboard/Header';
import { StandingsSidebar } from '../components/dashboard/StandingsSidebar';
import { StatCard } from '../components/dashboard/StatCard';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { LeaderboardPanel } from '../components/dashboard/LeaderboardPanel';
import { MonthlyCalendar } from '../components/dashboard/MonthlyCalendar';
import { RecentForm } from '../components/dashboard/RecentForm';
import { StatLeadersPanel } from '../components/dashboard/StatLeaders';
import { useTeamRecord, useUpcomingGames, useTopPlayers, useStandings, useTeams } from '../lib/api';
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
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!favTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, favTeam, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user || !favTeam || !team) return null;

  const nextGame = games?.[0] ?? null;
  const liveToday = games?.filter((g) => isToday(new Date(g.gameDateTime))).length ?? 0;

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => navigate({ to: '/' }),
    });
  };

  const chooseTeam = () => navigate({ to: '/onboarding' });

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
              value={liveToday}
              caption="Games"
            />
            <StatCard
              icon={<Target className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
              label="Accuracy"
              value={mockAccuracy}
              caption="This Week"
            />
          </div>

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
