import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { getSelectedTeam, clearSelectedTeam } from '../lib/team';
import { useSignOut, useSession } from '../lib/use-auth';
import { useTeamRecord, useUpcomingGames, useTopPlayers } from '../lib/api';
import { useEffect } from 'react';
import { isLightColor } from '../lib/color';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const team = getSelectedTeam();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const user = session?.user;
  const isLight = team ? isLightColor(team.primaryColor) : false;

  const { data: record } = useTeamRecord();
  const { data: games, isLoading: gamesLoading } = useUpcomingGames();
  const { data: players, isLoading: playersLoading } = useTopPlayers();

  useEffect(() => {
    if (!team) navigate({ to: '/onboarding' });
  }, [team, navigate]);

  if (!team) return null;

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        clearSelectedTeam();
        navigate({ to: '/' });
      },
    });
  };

  return (
    <div>
      {/* Team-colored header bar */}
      <div
        className="flex items-center gap-4 rounded-xl px-6 py-5"
        style={{ backgroundColor: team.primaryColor }}
      >
        <img src={team.logoUrl} alt={team.name} className="h-12 w-12 object-contain" />
        <div>
          <h1 className={`text-xl font-bold ${isLight ? 'text-stone-900' : 'text-white'}`}>
            {team.name}
          </h1>
          <span className={`text-sm ${isLight ? 'text-stone-700' : 'text-white/70'}`}>
            {team.abbr}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <span className={`text-sm ${isLight ? 'text-stone-700' : 'text-white/80'}`}>
              {user.name}
            </span>
          )}
          <button
            onClick={() => navigate({ to: '/onboarding' })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isLight ? 'bg-black/10 text-stone-800 hover:bg-black/15' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            Change Team
          </button>
          <button
            onClick={handleSignOut}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isLight ? 'bg-black/10 text-stone-800 hover:bg-black/15' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="mt-8 space-y-8">
        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Conference', value: record?.conference ?? '\u2014' },
            { label: 'Division', value: record?.division ?? '\u2014' },
            { label: 'Record', value: record ? `${record.wins}-${record.losses}` : '\u2014' },
            { label: 'Last Game', value: '\u2014' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-court-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                {stat.label}
              </p>
              <p className="mt-1 text-lg font-bold text-stone-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Upcoming games */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-stone-800">Upcoming Games</h2>
          <div className="rounded-xl border border-court-200 bg-white">
            {gamesLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-basketball-500" />
              </div>
            ) : games && games.length > 0 ? (
              <div className="divide-y divide-court-200">
                {games.map((game) => (
                  <div key={game.id} className="flex items-center gap-6 px-6 py-4">
                    <div className="flex-1 text-right">
                      <span className="text-sm font-medium text-stone-800">{game.awayTeam}</span>
                    </div>
                    <div className="text-center">
                      <span className="rounded-md bg-court-200 px-2 py-1 text-xs font-semibold text-stone-500">
                        {game.status}
                      </span>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-stone-800">{game.homeTeam}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-base text-stone-400">
                  Run the worker to sync NBA schedule data.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Top players */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-stone-800">Top Players</h2>
          <div className="rounded-xl border border-court-200 bg-white">
            {playersLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-basketball-500" />
              </div>
            ) : players && players.length > 0 ? (
              <div className="divide-y divide-court-200">
                {players.map((player) => (
                  <div key={player.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-stone-800">{player.name}</span>
                      <span className="ml-2 text-xs text-stone-400">{player.position}</span>
                    </div>
                    <Stat label="PTS" value={player.points} />
                    <Stat label="REB" value={player.rebounds} />
                    <Stat label="AST" value={player.assists} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-base text-stone-400">Run the worker to sync player stats.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-14 text-center">
      <p className="text-xs font-semibold text-stone-400">{label}</p>
      <p className="text-sm font-bold text-stone-700">{value.toFixed(1)}</p>
    </div>
  );
}
