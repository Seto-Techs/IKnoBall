import { ChevronLeft, Trophy } from 'lucide-react';
import { Avatar } from './kit';
import { SCREEN_TITLE, type Screen } from '../lib/nav';
import type { Me } from '../lib/api';

/**
 * The top bar is the whole of the chrome: the brand on the left, the two things
 * a player reaches for on the right. Discord's own title bar sits above it, so
 * this one stays short — a mobile-landscape window is only about 390px tall and
 * every pixel here comes out of the game.
 */
export function TopBar({
  me,
  screen,
  onNavigate,
  onProfile,
}: {
  me: Me;
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  onProfile: () => void;
}) {
  const onHome = screen === 'home';

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-brand-line bg-white px-2.5 py-2 sm:px-4">
      {!onHome && (
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Back to home"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-brand-navy transition-colors hover:bg-brand-cream"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      )}

      <button
        type="button"
        onClick={() => onNavigate('home')}
        className="flex items-center gap-2 rounded-lg pr-1 transition-opacity hover:opacity-80"
        aria-label="IKnoBall home"
      >
        <img src="/brand/iknoball-mark.svg" alt="" className="h-8 w-8" />
        <span className="font-heading text-[21px] font-semibold uppercase leading-none tracking-[0.06em] text-brand-navyDark">
          IKnoBall
        </span>
      </button>

      {!onHome && (
        <span className="ml-1 hidden items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-400 sm:flex">
          <span aria-hidden>/</span>
          {SCREEN_TITLE[screen]}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigate('leaderboard')}
          aria-current={screen === 'leaderboard' ? 'page' : undefined}
          className={`flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] font-semibold transition-colors ${
            screen === 'leaderboard'
              ? 'bg-brand-cream text-brand-navyDark'
              : 'text-brand-navy hover:bg-brand-cream'
          }`}
        >
          <Trophy className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Leaderboard</span>
          <span className="sr-only sm:hidden">Leaderboard</span>
        </button>

        <button
          type="button"
          onClick={onProfile}
          className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-cream"
        >
          <Avatar name={me.name} image={me.image} size={28} />
          <span className="hidden max-w-[9rem] truncate sm:inline">{me.name}</span>
          <span className="sr-only sm:hidden">Your profile</span>
        </button>
      </div>
    </header>
  );
}
