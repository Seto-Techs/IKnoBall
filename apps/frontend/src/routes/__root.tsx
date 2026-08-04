import { Outlet, createRootRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useSession, useSignOut } from '../lib/use-auth';
import { ChevronDown } from 'lucide-react';

function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-court-100"
              >
                {user.name}
                <ChevronDown
                  size={14}
                  className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-2 min-w-[10rem] rounded-lg border border-court-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        signOut.mutate(undefined, {
                          onSuccess: () => navigate({ to: '/' }),
                        });
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-court-100"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
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
    const { pathname } = useLocation();
    const isOnboarding = pathname.startsWith('/onboarding');
    const isDashboard = pathname.startsWith('/dashboard');

    return (
      <div
        className="min-h-screen text-stone-900 antialiased"
        style={{
          backgroundColor: 'var(--team-bg, #faf8f6)',
          transition: 'background-color 0.5s ease',
        }}
      >
        {!isOnboarding && <Header />}
        <main
          className={
            isOnboarding ? 'px-8 py-4' : `mx-auto px-4 py-6 ${isDashboard ? 'w-full' : 'max-w-6xl'}`
          }
        >
          <Outlet />
        </main>
      </div>
    );
  },
});
