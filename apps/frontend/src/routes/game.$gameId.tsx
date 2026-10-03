import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { Activity, MapPin } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { LoadingSpinner } from '../components/dashboard/shared';
import { AtAGlance } from '../components/gameDetail/AtAGlance';
import { MatchupHero } from '../components/gameDetail/MatchupHero';
import { TeamCard } from '../components/gameDetail/TeamCard';
import { PredictionPanel } from '../components/predict/PredictionPanel';
import { useTeamRecord, useTeams, useTopPlayers } from '../lib/api';
import { buildTeamLookup, resolveGameTeams } from '../lib/game-utils';
import { useGameById } from '../lib/use-game';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/game/$gameId')({
  component: GameDetailPage,
});

function GameDetailPage() {
  const navigate = useNavigate();
  const { gameId } = Route.useParams();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { game, isLoading } = useGameById(gameId);
  const { data: teams } = useTeams({ enabled: !!user });

  const lookup = useMemo(() => buildTeamLookup(teams), [teams]);
  const { away, home } = useMemo(
    () => (game ? resolveGameTeams(game, lookup) : { away: null, home: null }),
    [game, lookup],
  );

  const awayRecord = useTeamRecord(away?.abbreviation);
  const homeRecord = useTeamRecord(home?.abbreviation);

  const { data: awayPlayers, isLoading: awayPlayersLoading } = useTopPlayers(away?.abbreviation);
  const { data: homePlayers, isLoading: homePlayersLoading } = useTopPlayers(home?.abbreviation);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user) return null;

  const accentColor = home?.primaryColor ?? '#1C4188';

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader
        userName={user.name}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="game"
      />

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {isLoading && <LoadingSpinner />}

        {!isLoading && !game && (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="text-lg font-semibold text-stone-500">Game not found</p>
            <button
              type="button"
              onClick={() => navigate({ to: '/predict' })}
              className="rounded-full bg-brand-navyDark px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white"
            >
              Browse games
            </button>
          </div>
        )}

        {!isLoading && game && (
          <div className="flex flex-col gap-6">
            <MatchupHero
              game={game}
              away={away}
              home={home}
              onBack={() => navigate({ to: '/predict' })}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
              {/* Left: matchup detail */}
              <div className="flex min-w-0 flex-col gap-6">
                <AtAGlance gameId={gameId} />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {away ? (
                    <TeamCard
                      team={away}
                      record={awayRecord.data}
                      players={awayPlayers}
                      loading={awayPlayersLoading || awayRecord.isLoading}
                      side="away"
                      accentColor={away.primaryColor}
                    />
                  ) : null}
                  {home ? (
                    <TeamCard
                      team={home}
                      record={homeRecord.data}
                      players={homePlayers}
                      loading={homePlayersLoading || homeRecord.isLoading}
                      side="home"
                      accentColor={home.primaryColor}
                    />
                  ) : null}
                </div>

                {/* Venue + stamp info */}
                <div className="flex items-start gap-3 rounded-xl border border-brand-line bg-white px-5 py-4 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                    <MapPin className="h-4 w-4 text-stone-500" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Venue
                    </p>
                    <p className="text-sm font-semibold text-brand-ink">
                      {game.arenaName ?? `${away?.arena ?? 'TBD'} `}
                      {game.arenaCity ? `• ${game.arenaCity}` : ''}
                      {game.arenaState ? `, ${game.arenaState}` : ''}
                    </p>
                    {away && home && (
                      <p className="mt-1 text-xs text-stone-500">
                        {away.fullName} vs {home.fullName}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: prediction — sticky on desktop */}
              <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
                <PredictionPanel game={game} teams={teams} accentColor={accentColor} />
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
