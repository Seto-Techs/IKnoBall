import { Outlet, createRootRoute, Link, useLocation } from '@tanstack/react-router';
import { Logo } from '../components/brand/Logo';
import { SiteFooter } from '../components/site/Footer';
import { useSession } from '../lib/use-auth';

function Header() {
  const { data: session } = useSession();
  const user = session?.user;

  // Same chrome as the dashboard nav — sticky, hairline, same wordmark height —
  // and the same action buttons as the landing nav, so the shell, marketing and
  // in-app headers all read as one brand bar.
  return (
    <header className="sticky top-0 z-40 border-b border-brand-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
        <Link
          to="/"
          className="rounded-md text-brand-navy transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          aria-label="IKnoBall home"
        >
          <Logo className="h-7 w-auto" />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link
              to="/dashboard"
              search={{ tab: 'team' }}
              className="whitespace-nowrap rounded-lg bg-basketball-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 sm:px-4"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-brand-ink sm:px-3"
              >
                Sign in
              </Link>
              <Link
                to="/auth/register"
                className="whitespace-nowrap rounded-lg bg-basketball-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 sm:px-4"
              >
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
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

    // The landing page has its own full marketing footer, and onboarding is a
    // focused flow that should not offer ways out.
    const hasSiteFooter = !isLanding && !isOnboarding;

    return (
      <div
        className="flex min-h-screen flex-col bg-stone-200 text-stone-900 antialiased"
        style={{
          backgroundColor: 'var(--team-bg, #e7e5e4)',
          transition: 'background-color 0.5s ease',
        }}
      >
        {!isAppShell && <Header />}
        <main
          className={`flex flex-1 flex-col ${
            // The footer must never show before you reach the bottom, so the
            // main column always fills at least a viewport. A plain 100dvh is
            // deliberate: measuring the sticky header instead would put the
            // footer a few pixels above the fold on short pages.
            hasSiteFooter ? 'min-h-[100dvh]' : ''
          } ${
            isOnboarding
              ? 'px-8 py-4'
              : isAppShell
                ? 'w-full'
                : 'mx-auto w-full max-w-6xl px-4 py-6'
          }`}
        >
          <Outlet />
        </main>
        {hasSiteFooter && <SiteFooter />}
      </div>
    );
  },
});
