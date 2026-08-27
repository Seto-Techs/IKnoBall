import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CalendarDays, Target, TrendingUp, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { nbaTeams } from '../config/nba-teams';
import { DashboardHeader } from '../components/dashboard/Header';
import { StandingsSidebar } from '../components/dashboard/StandingsSidebar';
import { StatCard } from '../components/dashboard/StatCard';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { UpcomingGamesPanel } from '../components/dashboard/UpcomingMatches';
import { TopPlayersPanel } from '../components/dashboard/TopPlayers';
import { TeamLeaderPanel } from '../components/dashboard/TeamLeader';
import { ScheduleTable } from '../components/dashboard/ScheduleTable';
import { LeaderboardPanel } from '../components/dashboard/LeaderboardPanel';
import {
  mockGames,
  mockLeaderboard,
  mockLeagueToday,
  mockPlayers,
  mockRecord,
  mockStandings,
  mockTeamSeason,
  mockUserPoints,
  mockUserPointsWeighted,
  mockUserRankNumber,
  mockUserRankWeightedNumber,
  mockWeightedLeaderboard,
  type StandingEntry,
} from '../lib/mock-data';
import { getSelectedTeam } from '../lib/team';
import { useSession } from '../lib/use-auth';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function conferenceRank(standings: StandingEntry[], abbr: string): number {
  const team = nbaTeams.find((t) => t.abbreviation === abbr);
  if (!team) return 0;
  const sorted = standings
    .filter(
      (s) => nbaTeams.find((t) => t.abbreviation === s.abbr)?.conference === team.conference,
    )
    .sort(
      (a, b) =>
        b.wins / (b.wins + b.losses || 1) - a.wins / (a.wins + a.losses || 1),
    );
  return sorted.findIndex((s) => s.abbr === abbr) + 1;
}

function ViewTab({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 py-2.5 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy ${
        active
          ? 'border-brand-navy text-brand-navy'
          : 'border-transparent text-stone-500 hover:text-brand-ink'
      }`}
    >
      {children}
    </button>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const team = getSelectedTeam();
  const { data: session } = useSession();
  const user = session?.user;
  const [view, setView] = useState<'team' | 'league'>('team');

  const record = mockRecord;
  const games = mockGames;
  const players = mockPlayers;
  const teamInfo = nbaTeams.find((t) => t.abbreviation === team?.abbr);

  useEffect(() => {
    if (!team) navigate({ to: '/onboarding' });
  }, [team, navigate]);

  if (!team) return null;

  const nextGame = games[0];
  const teamConfRank = conferenceRank(mockStandings, team.abbr);
  const teamWinPct =
    record.wins + record.losses > 0
      ? Math.round((record.wins / (record.wins + record.losses)) * 100)
      : 0;
  const nextOpponentName = nextGame
    ? nextGame.homeTeam === team.name || nextGame.homeTeam === teamInfo?.fullName
      ? nextGame.awayTeam
      : nextGame.homeTeam
    : null;
  const nextOpponentAbbr = nextOpponentName
    ? nbaTeams.find((t) => t.fullName === nextOpponentName || t.teamName === nextOpponentName)
        ?.abbreviation
    : undefined;
  const leagueBest = [...mockStandings].sort(
    (a, b) => b.wins / (b.wins + b.losses || 1) - a.wins / (a.wins + a.losses || 1),
  )[0];
  const bestRecord = leagueBest ? `${leagueBest.abbr} ${leagueBest.wins}-${leagueBest.losses}` : '—';
  const liveNowCount = mockLeagueToday.filter((g) => g.status.toLowerCase() === 'live').length;

  const chooseTeam = () => navigate({ to: '/onboarding' });

  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader userName={user?.name} />

      <div className="mx-auto grid max-w-[1920px] grid-cols-1 grid-rows-[1fr] gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[288px_minmax(0,1fr)_288px]">
        <StandingsSidebar
          selectedAbbr={team.abbr}
          standings={mockStandings}
          className="hidden xl:block"
        />

        <main className="flex min-w-0 flex-col gap-6">
          <div role="tablist" aria-label="Dashboard view" className="flex gap-5 border-b border-brand-line">
            <ViewTab id="view-team" active={view === 'team'} onClick={() => setView('team')}>
              My Team
            </ViewTab>
            <ViewTab id="view-league" active={view === 'league'} onClick={() => setView('league')}>
              League
            </ViewTab>
          </div>

          {view === 'team' ? (
            <>
              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
                <StatCard
                  icon={<Trophy className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Record"
                  value={`${record.wins}-${record.losses}`}
                  caption={
                    teamInfo
                      ? `${teamInfo.conference === 'East' ? 'Eastern' : 'Western'} Conference`
                      : 'Conference'
                  }
                />
                <StatCard
                  icon={<TrendingUp className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Conf Rank"
                  value={teamConfRank === 1 ? '1st' : teamConfRank === 2 ? '2nd' : teamConfRank === 3 ? '3rd' : `${teamConfRank}th`}
                  caption={teamInfo ? `${teamInfo.division} Division` : 'Division'}
                />
                <StatCard
                  icon={<Target className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Win %"
                  value={`${teamWinPct}%`}
                  caption="This Season"
                />
                <StatCard
                  icon={<Zap className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Next Up"
                  value={nextOpponentAbbr ?? '—'}
                  caption="Next Game"
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
                <UpcomingGamesPanel games={mockTeamSeason} />
                <TeamLeaderPanel players={mockPlayers.filter((p) => p.team === team.abbr)} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
                <StatCard
                  icon={<CalendarDays className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Games Today"
                  value={mockLeagueToday.length}
                  caption="League Wide"
                />
                <StatCard
                  icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Teams"
                  value={nbaTeams.length}
                  caption="Active Franchises"
                />
                <StatCard
                  icon={<Trophy className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Best Record"
                  value={bestRecord}
                  caption="League Leader"
                />
                <StatCard
                  icon={<Zap className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Live Now"
                  value={liveNowCount}
                  caption="Games in Progress"
                />
              </div>

              <UpcomingGamesPanel games={mockLeagueToday} />
              <TopPlayersPanel players={players} />
            </>
          )}

          <ScheduleTable games={games} />
        </main>

        <aside className="hidden flex-col gap-6 xl:flex">
          <LeaderboardPanel
            title="Leaderboard"
            entries={mockLeaderboard}
            userRank={mockUserRankNumber}
            userPoints={mockUserPoints}
            userName={user?.name}
          />
          <LeaderboardPanel
            title="Weighted"
            weighted
            entries={mockWeightedLeaderboard}
            userRank={mockUserRankWeightedNumber}
            userPoints={mockUserPointsWeighted}
            userName={user?.name}
          />
        </aside>
      </div>
    </div>
  );
}
