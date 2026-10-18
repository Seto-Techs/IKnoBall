import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Activity } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { LoadingSpinner } from '../components/dashboard/shared';
import { CareerPanel } from '../components/playerDetail/CareerTable';
import { GameLogPanel } from '../components/playerDetail/GameLog';
import { PlayerHero } from '../components/playerDetail/PlayerHero';
import { NextGamePanel, TeamInfoPanel } from '../components/playerDetail/PlayerRail';
import { ShotZonePanel } from '../components/playerDetail/ShotZonePanel';
import { usePlayer } from '../lib/api';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/player/$playerId')({
  component: PlayerDetailPage,
});

function PlayerDetailPage() {
  const navigate = useNavigate();
  const { playerId } = Route.useParams();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { data: player, isLoading } = usePlayer(playerId);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user) return null;

  const accentColor = player?.team?.primaryColor || '#1C4188';

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  // A player has no list page to return to, so Back lands on the dashboard the
  // header's wordmark points at.
  const goHome = () => navigate({ to: '/dashboard', search: { tab: 'team' } });

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="player"
      />

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {isLoading && <LoadingSpinner />}

        {!isLoading && !player && (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="text-lg font-semibold text-stone-500">Player not found</p>
            <button
              type="button"
              onClick={goHome}
              className="rounded-md bg-brand-navyDark px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {!isLoading && player && (
          <div className="flex flex-col gap-6">
            <PlayerHero player={player} onBack={goHome} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
              {/* Left: the player's own numbers. The Career table leads with the
                  season-by-season stats, the shot-zone chart then shows where
                  those numbers come from, and the game log is the detail. */}
              <div className="flex min-w-0 flex-col gap-6">
                <CareerPanel seasons={player.seasons} />
                <ShotZonePanel playerId={player.id} />
                <GameLogPanel playerId={player.id} />
              </div>

              {/* Right: who they play for and when — sticky on desktop */}
              <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
                <NextGamePanel game={player.nextGame} />
                <TeamInfoPanel team={player.team} />
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
