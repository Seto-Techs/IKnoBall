import { Bell, User } from 'lucide-react';

export function DashboardHeader({ userName }: { userName?: string }) {
  return (
    <header className="border-b border-brand-line bg-white">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-6 py-3">
        <span className="font-heading text-2xl font-semibold uppercase tracking-wide text-brand-red">
          IKnowBall
        </span>

        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={userName ? `Account: ${userName}` : 'Account'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white transition-colors hover:bg-brand-navyDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            {userName ? (
              userName.charAt(0).toUpperCase()
            ) : (
              <User className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
