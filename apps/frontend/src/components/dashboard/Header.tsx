import { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, User, UserRound } from 'lucide-react';

export function DashboardHeader({
  userName,
  onSignOut,
}: {
  userName?: string;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="border-b border-brand-line bg-white">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-6 py-3">
        <span className="font-heading text-2xl font-semibold uppercase tracking-wide text-brand-red">
          IKnoBall
        </span>

        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label={userName ? `Account: ${userName}` : 'Account'}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white transition-colors hover:bg-brand-navyDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              {userName ? (
                userName.charAt(0).toUpperCase()
              ) : (
                <User className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  aria-disabled="true"
                  className="flex w-full cursor-not-allowed items-center gap-2.5 px-4 py-3 text-left text-base font-medium text-stone-400"
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Profile
                  <span className="ml-auto rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Soon
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
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
    </header>
  );
}
