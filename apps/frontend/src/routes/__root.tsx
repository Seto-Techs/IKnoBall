import { Outlet, createRootRoute, Link, useLocation } from '@tanstack/react-router';
import { useSession } from '../lib/use-auth';

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
    const { pathname } = useLocation();
    const isOnboarding = pathname.startsWith('/onboarding');

    return (
      <div className="min-h-screen bg-court-50 text-stone-900 antialiased">
        {!isOnboarding && <Header />}
        <main className={isOnboarding ? 'px-8 py-4' : 'mx-auto max-w-6xl px-4 py-6'}>
          <Outlet />
        </main>
      </div>
    );
  },
});
