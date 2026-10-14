import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { Activity, MapPin } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { LoadingSpinner } from '../components/dashboard/shared';
import { AtAGlance } from '../components/gameDetail/AtAGlance';
import { BoxScorePanel } from '../components/gameDetail/BoxScore';
import { MatchupHero } from '../components/gameDetail/MatchupHero';
import { TeamCard } from '../components/gameDetail/TeamCard';
import { PredictionPanel } from '../components/predict/PredictionPanel';
import { useGameBoxscore, useTeamRecord, useTeams, useTopPlayers } from '../lib/api';
import {
  buildTeamLookup,
  getGameStatus,
  resolveGameTeams,
  scheduleTeamIdentity,
} from '../lib/game-utils';
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
  const { data: boxscore } = useGameBoxscore(gameId);

  const lookup = useMemo(() => buildTeamLookup(teams), [teams]);
  const { away, home } = useMemo(
    () => (game ? resolveGameTeams(game, lookup) : { away: null, home: null }),
    [game, lookup],
  );

  // Sides we track come from `teams`; preseason tours and exhibition games are
  // played against clubs that are not in it, so the schedule's own name for the
  // side keeps the team summaries two-up instead of dropping a column.
  const awaySide = away ?? (game ? scheduleTeamIdentity(game, 'away') : null);
  const homeSide = home ?? (game ? scheduleTeamIdentity(game, 'home') : null);

  const awayRecord = useTeamRecord(away?.abbreviation);
  const homeRecord = useTeamRecord(home?.abbreviation);

  // The team previews are season context for a game that has not started; once
  // it is under way the box score replaces them.
  const showTeamPreview = !!game && getGameStatus(game) === 'scheduled';

  const { data: awayPlayers, isLoading: awayPlayersLoading } = useTopPlayers(away?.abbreviation);
  const { data: homePlayers, isLoading: homePlayersLoading } = useTopPlayers(home?.abbreviation);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user) return null;

  const accentColor = homeSide?.primaryColor ?? '#1C4188';

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
              className="rounded-md bg-brand-navyDark px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white"
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
                <AtAGlance gameId={gameId} awayTeam={away} homeTeam={home} />

                {boxscore ? (
                  <BoxScorePanel
                    data={boxscore}
                    awayColor={away?.primaryColor}
                    homeColor={home?.primaryColor}
                  />
                ) : null}

                {showTeamPreview && (
                  // items-start keeps each summary its own height: a side we do
                  // not track carries no record, coach or players, and stretching
                  // it to the other card's height leaves its accent footer
                  // floating mid-card.
                  <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                    {awaySide ? (
                      <TeamCard
                        team={awaySide}
                        record={awayRecord.data}
                        players={awayPlayers}
                        loading={awayPlayersLoading || awayRecord.isLoading}
                        side="away"
                      />
                    ) : null}
                    {homeSide ? (
                      <TeamCard
                        team={homeSide}
                        record={homeRecord.data}
                        players={homePlayers}
                        loading={homePlayersLoading || homeRecord.isLoading}
                        side="home"
                      />
                    ) : null}
                  </div>
                )}

                {/* Venue + stamp info */}
                <div className="flex items-start gap-3 rounded-xl border border-brand-line bg-white px-5 py-4 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                    <MapPin className="h-4 w-4 text-stone-500" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                      Venue
                    </p>
                    <p className="text-sm font-semibold text-brand-ink">
                      {game.arenaName ?? `${awaySide?.arena ?? 'TBD'} `}
                      {game.arenaCity ? `• ${game.arenaCity}` : ''}
                      {game.arenaState ? `, ${game.arenaState}` : ''}
                    </p>
                    {awaySide && homeSide && (
                      <p className="mt-1 text-xs text-stone-500">
                        {awaySide.fullName} vs {homeSide.fullName}
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
