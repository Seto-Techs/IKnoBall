import { Outlet, createRootRoute, Link, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSession } from '../lib/use-auth';
import { getSelectedTeam, setSelectedTeam } from '../lib/team';
import { nbaTeams } from '../config/nba-teams';

function Header() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="border-b border-court-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-basketball-500 text-sm font-bold text-white shadow-sm">
            IK
          </div>
          <span className="text-lg font-semibold tracking-tight text-stone-800">IKnoBall</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <span className="text-sm text-stone-600">{user.name}</span>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-court-100"
              >
                Sign in
              </Link>
              <Link
                to="/auth/register"
                className="rounded-md bg-basketball-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-basketball-600"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export const Route = createRootRoute({
  component: () => {
    const { data: session } = useSession();
    const { pathname } = useLocation();
    const isOnboarding = pathname.startsWith('/onboarding');

    // Sync favoriteTeam from session → localStorage (cross-device login)
    useEffect(() => {
      const favTeam = session?.user?.favoriteTeam;
      if (!favTeam) return;
      const local = getSelectedTeam();
      if (local?.abbr === favTeam) return;
      const team = nbaTeams.find((t) => t.abbreviation === favTeam);
      if (team) {
        setSelectedTeam({
          abbr: team.abbreviation,
          name: team.fullName,
          primaryColor: team.primaryColor,
          logoUrl: team.logoUrl,
        });
      }
    }, [session?.user?.favoriteTeam]);
    return (
      <div
        className="min-h-screen text-stone-900 antialiased"
        style={{
          backgroundColor: 'var(--team-bg, #faf8f6)',
          transition: 'background-color 0.5s ease',
        }}
      >
        {!isOnboarding && <Header />}
        <main className={isOnboarding ? 'px-8 py-4' : 'mx-auto max-w-6xl px-4 py-6'}>
          <Outlet />
        </main>
      </div>
    );
  },
});
