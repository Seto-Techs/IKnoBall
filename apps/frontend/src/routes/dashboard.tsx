import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isToday } from 'date-fns';
import { Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { DashboardHeader } from '../components/dashboard/Header';
import { StandingsSidebar } from '../components/dashboard/StandingsSidebar';
import { StatCard } from '../components/dashboard/StatCard';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { UpcomingGamesPanel } from '../components/dashboard/UpcomingMatches';
import { TopPlayersPanel } from '../components/dashboard/TopPlayers';
import { ScheduleTable } from '../components/dashboard/ScheduleTable';
import { TeamCard, AccountCard } from '../components/dashboard/AccountCard';
import { useTeamRecord, useUpcomingGames, useTopPlayers, useStandings, useTeams } from '../lib/api';
import { mockAccuracy, mockUserPredictions, mockUserRank } from '../lib/mock-data';
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

  const { data: record } = useTeamRecord(favTeam ?? undefined);
  const { data: games, isLoading: gamesLoading } = useUpcomingGames(favTeam ?? undefined);
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
    <div className="min-h-screen bg-white">
      <DashboardHeader userName={user.name} />

      <div className="mx-auto grid max-w-[1920px] grid-cols-1 grid-rows-[1fr] gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[288px_minmax(0,1fr)_288px]">
        <StandingsSidebar
          selectedAbbr={team.abbreviation}
          standings={standings ?? null}
          loading={standingsLoading}
          className="hidden xl:block"
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <UpcomingGamesPanel
              games={games}
              loading={gamesLoading}
              userTeam={team}
              teams={teams}
            />
            <TopPlayersPanel players={players} loading={playersLoading} />
          </div>

          <ScheduleTable games={games} loading={gamesLoading} teams={teams} />
        </main>

        <aside className="hidden flex-col gap-6 xl:flex">
          <TeamCard team={team} />
          <AccountCard user={user} onChooseTeam={chooseTeam} onSignOut={handleSignOut} />
        </aside>
      </div>
    </div>
  );
}
