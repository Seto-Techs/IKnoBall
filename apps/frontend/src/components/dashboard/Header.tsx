import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, ChevronDown, LogOut, User, UserRound } from 'lucide-react';
import { hexLuminance } from './shared';
import { GlobalSearchField, GlobalSearchTrigger } from './GlobalSearch';

export type NavKey = 'dashboard' | 'predict' | 'profile' | 'game' | undefined;

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'predict', label: 'Predictions' },
];

// Game detail lives in the Predictions section, so it keeps that tab lit.
function resolveNavKey(active?: NavKey): NavKey {
  return active === 'game' ? 'predict' : active;
}

function navClass(on: boolean): string {
  return `rounded-sm px-1 py-2 text-sm font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
    on
      ? 'text-brand-navyDark underline decoration-2 underline-offset-[10px]'
      : 'text-stone-500 hover:text-brand-ink'
  }`;
}

function mobileNavClass(on: boolean): string {
  return `flex min-h-[44px] flex-1 items-center justify-center px-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
    on ? 'text-brand-navyDark underline decoration-[3px] underline-offset-[10px]' : 'text-stone-500'
  }`;
}

export function DashboardHeader({
  userName,
  accentColor,
  onSignOut,
  active,
}: {
  userName?: string;
  accentColor?: string;
  onSignOut: () => void;
  active?: NavKey;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Sticky content in the document scrollport (dashboard rails, panel titles)
  // offsets by the nav's height so it lands below the nav instead of pinned
  // behind it. The nav grows on narrow screens where its nav row wraps, so
  // publish the measured height rather than a hardcoded one.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty('--header-h', `${header.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-h');
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const activeColor = accentColor ?? '#1C4188';
  const activeNav = resolveNavKey(active);
  const onProfile = active === 'profile';
  // White text fails on bright team colors (gold is ~1.7:1), so flip to ink.
  const avatarTextClass = hexLuminance(activeColor) > 0.45 ? 'text-brand-ink' : 'text-white';
  // Opening search dismisses the account menu; the menu's own outside-click
  // listener handles the reverse, so the two never stack.
  const closeAccountMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-brand-line bg-white/90 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-6 py-3">
        {/* Left: wordmark + primary nav. */}
        <div className="flex shrink-0 items-center gap-8">
          <Link
            to="/dashboard"
            search={{ tab: 'team' }}
            className="rounded-md font-heading text-2xl font-semibold uppercase tracking-wide text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            IKnoBall
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
            {NAV_ITEMS.map((item) =>
              item.key === 'predict' ? (
                <Link
                  key={item.key}
                  to="/predict"
                  className={navClass(activeNav === item.key)}
                  aria-current={activeNav === item.key ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.key}
                  to="/dashboard"
                  search={{ tab: 'team' }}
                  className={navClass(activeNav === item.key)}
                  aria-current={activeNav === item.key ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        {/* Middle: global search. Inline on lg+; below lg the trigger opens a sheet. */}
        <div className="hidden min-w-0 flex-1 justify-center px-4 lg:flex">
          <GlobalSearchField onActivate={closeAccountMenu} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <GlobalSearchTrigger onActivate={closeAccountMenu} />
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <div ref={menuRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              aria-label={userName ? `Account: ${userName}` : 'Account'}
              aria-expanded={menuOpen}
              aria-controls="account-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
                onProfile ? 'ring-2 ring-brand-navy ring-offset-2' : ''
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${avatarTextClass}`}
                style={{ backgroundColor: activeColor }}
              >
                {userName ? (
                  userName.charAt(0).toUpperCase()
                ) : (
                  <User className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-stone-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                id="account-menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
              >
                <div className="border-b border-brand-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-brand-ink">
                    {userName ?? 'Guest'}
                  </p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-base font-medium text-brand-ink transition-colors hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-brand-line px-4 py-3 text-left text-base font-medium text-brand-ink transition-colors hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav
        aria-label="Primary mobile"
        className="flex items-stretch border-t border-brand-line px-6 sm:hidden"
      >
        {NAV_ITEMS.map((item) =>
          item.key === 'predict' ? (
            <Link
              key={item.key}
              to="/predict"
              className={mobileNavClass(activeNav === item.key)}
              aria-current={activeNav === item.key ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ) : (
            <Link
              key={item.key}
              to="/dashboard"
              search={{ tab: 'team' }}
              className={mobileNavClass(activeNav === item.key)}
              aria-current={activeNav === item.key ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}
