import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSession } from '../lib/use-auth';
import { useTeamRecord, useUpcomingGames, useTopPlayers, useTeams, useStandings } from '../lib/api';
import { useEffect } from 'react';
import { isLightColor } from '../lib/color';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const favTeam = session?.user?.favoriteTeam ?? null;
  const { data: teams } = useTeams({ enabled: !!session?.user });
  const team = favTeam ? (teams?.find((t) => t.abbreviation === favTeam) ?? null) : null;
  const isLight = team ? isLightColor(team.primaryColor) : false;

  const { data: record } = useTeamRecord(favTeam ?? undefined);
  const {
    data: games,
    isLoading: gamesLoading,
    isError: gamesError,
  } = useUpcomingGames(favTeam ?? undefined);
  const {
    data: players,
    isLoading: playersLoading,
    isError: playersError,
  } = useTopPlayers(favTeam ?? undefined);
  const { data: standings, isLoading: standingsLoading, isError: standingsError } = useStandings();

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!session?.user) navigate({ to: '/auth/login' });
    else if (!favTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, session?.user, favTeam, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!session?.user || !favTeam || !team) return null;

  return (
    <div>
      {/* Content area */}
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[18rem_minmax(0,72rem)_1fr]">
        {/* Standings rail (desktop only) */}
        <aside className="hidden xl:block xl:sticky xl:top-6">
          <section>
            <div className="rounded-xl border border-court-200 bg-white py-4 px-2">
              {standingsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-basketball-500" />
                </div>
              ) : standingsError ? (
                <div className="p-8 text-center">
                  <p className="text-base text-stone-400">Couldn't load standings.</p>
                </div>
              ) : standings ? (
                <div className="space-y-6">
                  {(['West', 'East'] as const).map((conf) => (
                    <div key={conf}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400 px-2">
                        {conf === 'West' ? 'Western Conference' : 'Eastern Conference'}
                      </h3>
                      <div className="grid grid-cols-[1.5rem_1fr_2rem_2rem_2.5rem] items-center gap-2 border-b border-court-200 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                        <span />
                        <span>Team</span>
                        <span className="text-right">W</span>
                        <span className="text-right">L</span>
                        <span className="text-right">GB</span>
                      </div>
                      {standings[conf].map((row) => {
                        const isUser = row.teamAbbr === team.abbreviation;
                        const boundary =
                          row.rank === 6
                            ? 'border-b-2 border-dashed border-stone-300'
                            : row.rank === 10
                              ? 'border-b-2 border-solid border-stone-400'
                              : 'border-b border-court-100';
                        return (
                          <div
                            key={row.teamAbbr}
                            className={`grid grid-cols-[1.5rem_1fr_2rem_2rem_2.5rem] items-center gap-2 py-1.5 px-2 text-xs ${boundary} ${isUser ? 'bg-court-100' : ''}`}
                          >
                            <img
                              src={row.logoUrl}
                              alt={row.teamAbbr}
                              className="h-5 w-5 object-contain"
                            />
                            <span className="flex items-center gap-1 font-medium text-stone-700">
                              {row.teamAbbr}
                              {row.marker && (
                                <span className="text-[10px] font-bold text-stone-400">
                                  {row.marker}
                                </span>
                              )}
                            </span>
                            <span className="text-right text-stone-600">{row.wins}</span>
                            <span className="text-right text-stone-600">{row.losses}</span>
                            <span className="text-right text-stone-500">
                              {Number.isInteger(row.gamesBack)
                                ? row.gamesBack
                                : row.gamesBack.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        <div className="mx-auto w-full max-w-6xl">
          {/* Team-colored header bar */}
          <div
            className="flex items-center gap-4 rounded-xl px-6 py-5"
            style={{ backgroundColor: team.primaryColor }}
          >
            <img src={team.logoUrl} alt={team.fullName} className="h-12 w-12 object-contain" />
            <div>
              <h1 className={`text-xl font-bold ${isLight ? 'text-stone-900' : 'text-white'}`}>
                {team.fullName}
              </h1>
              <span className={`text-sm ${isLight ? 'text-stone-700' : 'text-white/70'}`}>
                {team.abbreviation}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => navigate({ to: '/onboarding' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isLight ? 'bg-black/10 text-stone-800 hover:bg-black/15' : 'bg-white/15 text-white hover:bg-white/25'}`}
              >
                Change Team
              </button>
            </div>
          </div>

          <div className="mt-8 space-y-8">
            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Conference', value: record?.conference ?? '\u2014' },
                { label: 'Division', value: record?.division ?? '\u2014' },
                { label: 'Record', value: record ? `${record.wins}-${record.losses}` : '\u2014' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-court-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-bold text-stone-900">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Last 5 games */}
            {record && (
              <section>
                <h2 className="mb-4 text-lg font-bold text-stone-800">Last 5 Games</h2>
                {record.lastGames.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    {record.lastGames.map((game) => {
                      const isWin = game.ourScore > game.oppScore;
                      const oppTeam = teams?.find((t) => t.abbreviation === game.opponentAbbr);
                      const away = game.isHome
                        ? { abbr: game.opponentAbbr, logo: oppTeam?.logoUrl, score: game.oppScore }
                        : { abbr: team.abbreviation, logo: team.logoUrl, score: game.ourScore };
                      const home = game.isHome
                        ? { abbr: team.abbreviation, logo: team.logoUrl, score: game.ourScore }
                        : { abbr: game.opponentAbbr, logo: oppTeam?.logoUrl, score: game.oppScore };
                      return (
                        <div
                          key={`${game.gameDate}-${game.opponentAbbr}`}
                          className="flex flex-col items-center rounded-xl border border-court-200 bg-white p-3"
                        >
                          <p className="text-xs font-medium text-stone-400">
                            {new Date(`${game.gameDate}T00:00:00`).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                          <div className="mt-2 flex w-full items-stretch justify-between">
                            <div className="flex flex-col items-center gap-1">
                              <img
                                src={away.logo}
                                alt={away.abbr}
                                className="h-8 w-8 object-contain"
                              />
                              <span className="text-xs font-semibold text-stone-700">
                                {away.abbr}
                              </span>
                              <span className="text-sm font-bold text-stone-900">{away.score}</span>
                            </div>
                            <div className="flex w-6 flex-col items-center justify-between pt-2">
                              <span className="text-xs font-semibold text-stone-400">@</span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${
                                  isWin ? 'bg-green-600' : 'bg-red-600'
                                }`}
                              >
                                {isWin ? 'W' : 'L'}
                              </span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <img
                                src={home.logo}
                                alt={home.abbr}
                                className="h-8 w-8 object-contain"
                              />
                              <span className="text-xs font-semibold text-stone-700">
                                {home.abbr}
                              </span>
                              <span className="text-sm font-bold text-stone-900">{home.score}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-court-200 bg-white p-8 text-center">
                    <p className="text-base text-stone-400">No games played yet.</p>
                  </div>
                )}
              </section>
            )}

            {/* Upcoming games */}
            <section>
              <h2 className="mb-4 text-lg font-bold text-stone-800">Upcoming Games</h2>
              <div className="rounded-xl border border-court-200 bg-white">
                {gamesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-basketball-500" />
                  </div>
                ) : gamesError ? (
                  <div className="p-8 text-center">
                    <p className="text-base text-stone-400">Couldn't load games.</p>
                  </div>
                ) : games && games.length > 0 ? (
                  <div className="divide-y divide-court-200">
                    {games.map((game) => (
                      <div key={game.id} className="flex items-center gap-6 px-6 py-4">
                        <div className="flex-1 text-right">
                          <span className="text-sm font-medium text-stone-800">
                            {game.awayTeam}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="rounded-md bg-court-200 px-2 py-1 text-xs font-semibold text-stone-500">
                            {new Date(game.gameDateTime).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-stone-800">
                            {game.homeTeam}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-base text-stone-400">No upcoming games.</p>
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
                ) : playersError ? (
                  <div className="p-8 text-center">
                    <p className="text-base text-stone-400">Couldn't load player stats.</p>
                  </div>
                ) : players && players.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="flex flex-col items-center rounded-xl border border-court-200 p-4"
                      >
                        <img
                          src={player.headshotUrl}
                          alt={player.name}
                          className="h-24 w-24 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <p className="mt-2 text-sm font-semibold text-stone-800">{player.name}</p>
                        <span className="text-xs text-stone-400">{player.position}</span>
                        <div className="mt-3 flex items-start gap-4">
                          <Stat label="PTS" value={player.points} />
                          <Stat label="REB" value={player.rebounds} />
                          <Stat label="AST" value={player.assists} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-base text-stone-400">No player stats yet.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
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
