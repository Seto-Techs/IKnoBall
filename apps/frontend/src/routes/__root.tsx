import { Outlet, createRootRoute, Link, useLocation } from '@tanstack/react-router';
import { BrandMark } from '../components/BrandMark';
import { useSession } from '../lib/use-auth';

function Header() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="border-b border-court-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-3">
          <BrandMark
            className="gap-3"
            tileClassName="h-8 w-8 rounded-md bg-basketball-500 text-sm font-bold shadow-sm"
            wordmarkClassName="text-lg font-semibold tracking-tight text-stone-800"
          />
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
    // The landing page is full-bleed and ships its own nav, so the shell must
    // not wrap it in a max-width container or render the default header.
    const isLanding = pathname === '/';
    // These routes render the dashboard header and own their own page width and
    // padding, so the shell must not wrap them in a max-width container.
    const isAppShell =
      isLanding ||
      isOnboarding ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/predict') ||
      pathname.startsWith('/profile') ||
      pathname.startsWith('/game') ||
      pathname.startsWith('/player');

    return (
      <div
        className="min-h-screen bg-stone-200 text-stone-900 antialiased"
        style={{
          backgroundColor: 'var(--team-bg, #e7e5e4)',
          transition: 'background-color 0.5s ease',
        }}
      >
        {!isAppShell && <Header />}
        <main
          className={
            isOnboarding ? 'px-8 py-4' : isAppShell ? 'w-full' : 'mx-auto max-w-6xl px-4 py-6'
          }
        >
          <Outlet />
        </main>
      </div>
    );
  },
});
