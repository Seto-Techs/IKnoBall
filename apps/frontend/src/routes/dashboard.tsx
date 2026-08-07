import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isToday } from 'date-fns';
import { Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { nbaTeams } from '../config/nba-teams';
import { DashboardHeader } from '../components/dashboard/Header';
import { StandingsSidebar } from '../components/dashboard/StandingsSidebar';
import { StatCard } from '../components/dashboard/StatCard';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { UpcomingGamesPanel } from '../components/dashboard/UpcomingMatches';
import { TopPlayersPanel } from '../components/dashboard/TopPlayers';
import { ScheduleTable } from '../components/dashboard/ScheduleTable';
import { TeamCard, AccountCard } from '../components/dashboard/AccountCard';
import {
  mockAccuracy,
  mockGames,
  mockPlayers,
  mockUserPredictions,
  mockUserRank,
  mockRecord,
  mockStandings,
} from '../lib/mock-data';
import { clearSelectedTeam, getSelectedTeam } from '../lib/team';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const team = getSelectedTeam();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const record = mockRecord;
  const games = mockGames;
  const players = mockPlayers;
  const teamInfo = nbaTeams.find((t) => t.abbreviation === team?.abbr);

  useEffect(() => {
    if (!team) navigate({ to: '/onboarding' });
  }, [team, navigate]);

  if (!team) return null;

  const nextGame = games[0];
  const liveToday = games.filter((g) => isToday(new Date(g.gameDateTime))).length;

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        clearSelectedTeam();
        navigate({ to: '/' });
      },
    });
  };

  const chooseTeam = () => navigate({ to: '/onboarding' });

  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader userName={user?.name} />

      <div className="mx-auto grid max-w-[1920px] grid-cols-1 grid-rows-[1fr] gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[288px_minmax(0,1fr)_288px]">
        <StandingsSidebar selectedAbbr={team.abbr} standings={mockStandings} className="hidden xl:block" />

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
            teamInfo={teamInfo}
            record={record}
            nextGame={nextGame}
            onChooseTeam={chooseTeam}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <UpcomingGamesPanel games={games} />
            <TopPlayersPanel players={players} />
          </div>

          <ScheduleTable games={games} />
        </main>

        <aside className="hidden flex-col gap-6 xl:flex">
          <TeamCard team={team} teamInfo={teamInfo} />
          <AccountCard user={user} onChooseTeam={chooseTeam} onSignOut={handleSignOut} />
        </aside>
      </div>
    </div>
  );
}

