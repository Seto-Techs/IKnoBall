import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, ChevronDown, LogOut, User, UserRound } from 'lucide-react';
import { hexLuminance } from './shared';
import { GlobalSearchField, GlobalSearchTrigger } from './GlobalSearch';
import { Logo } from '../brand/Logo';
import { navLinkClass } from '../brand/nav';

export type NavKey =
  | 'dashboard'
  | 'predict'
  | 'rankings'
  | 'profile'
  | 'game'
  | 'player'
  | undefined;

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'predict', label: 'Predictions' },
  // The dashboard rails hold standings and the boards from xl up; the rankings
  // page is the only place they exist below that, so it is a top-level tab.
  { key: 'rankings', label: 'Rankings' },
];

// Game detail lives in the Predictions section, so it keeps that tab lit. A
// player profile belongs to no section — it is reached from search, a box score
// or a team panel — so it lights nothing and `resolveNavKey` passes it through.
function resolveNavKey(active?: NavKey): NavKey {
  return active === 'game' ? 'predict' : active;
}

// Nav type comes from the shared brand module so the root shell, landing and
// dashboard headers stay identical.
function navClass(on: boolean): string {
  return navLinkClass(on, 'light', 'rounded-sm px-1 py-2');
}

function mobileNavClass(on: boolean): string {
  return navLinkClass(
    on,
    'light',
    'flex min-h-[44px] flex-1 items-center justify-center px-1 py-3',
  );
}

/**
 * One primary nav entry. Dashboard and Rankings carry their default search so a
 * tap lands on the team tab or the standings tab rather than replaying whatever
 * the previous visit left in the URL.
 */
function NavItem({
  item,
  active,
  className,
}: {
  item: (typeof NAV_ITEMS)[number];
  active?: NavKey;
  className: string;
}) {
  const isActive = active === item.key;
  const props = {
    className,
    'aria-current': isActive ? ('page' as const) : undefined,
  };

  if (item.key === 'predict') {
    return (
      <Link to="/predict" {...props}>
        {item.label}
      </Link>
    );
  }

  if (item.key === 'rankings') {
    return (
      <Link to="/rankings" search={{ tab: 'standings', board: 'flat' }} {...props}>
        {item.label}
      </Link>
    );
  }

  return (
    <Link to="/dashboard" search={{ tab: 'team' }} {...props}>
      {item.label}
    </Link>
  );
}

export function DashboardHeader({
  userName,
  userImage,
  accentColor,
  onSignOut,
  active,
}: {
  userName?: string;
  /** The account avatar. Falls back to the name's initial when unset or broken. */
  userImage?: string | null;
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
            className="rounded-md text-brand-navy transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            aria-label="IKnoBall home"
          >
            <Logo className="h-7 w-auto" />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                active={activeNav}
                className={navClass(activeNav === item.key)}
              />
            ))}
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
            className="flex h-9 w-9 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
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
              <HeaderAvatar
                name={userName}
                image={userImage}
                color={activeColor}
                textClass={avatarTextClass}
              />
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

      {/* Mobile nav. Tighter horizontal padding than the wordmark row: three
          items have to fit a 320px screen without clipping a label. */}
      <nav
        aria-label="Primary mobile"
        className="flex items-stretch border-t border-brand-line px-2 sm:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            active={activeNav}
            className={mobileNavClass(activeNav === item.key)}
          />
        ))}
      </nav>
    </header>
  );
}

/**
 * The account avatar in the header.
 *
 * Uses the uploaded image when there is one and falls back to the name's initial
 * on the team-coloured disc. The image can fail to load — a stale URL, or an orb
 * that cannot reach the CDN — so a failure flips back to the initial rather than
 * leaving a broken image in the nav.
 */
function HeaderAvatar({
  name,
  image,
  color,
  textClass,
}: {
  name?: string;
  image?: string | null;
  color: string;
  textClass: string;
}) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${textClass}`}
      style={{ backgroundColor: color }}
    >
      {name ? name.charAt(0).toUpperCase() : <User className="h-4 w-4" aria-hidden="true" />}
    </span>
  );
}
