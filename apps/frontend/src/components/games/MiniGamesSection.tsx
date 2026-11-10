import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { GameCard } from './GameCard';
import { SectionHead } from './SectionHead';
import { MINI_GAMES } from './catalog';

/**
 * The mini games band on the landing page.
 *
 * Its own section, not a feature bullet: the games are a second thing you can do
 * on the site, so they get a heading, an exit to their own page and the same
 * shelf the games page repeats. Two cards fill the grid exactly at every width
 * above `sm`; below it they stack, which is the only column count that fits.
 */
export function MiniGamesSection() {
  return (
    <section id="mini-games" className="scroll-mt-20 border-y border-brand-line bg-brand-cream">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-16">
        <SectionHead
          kicker="Mini games"
          title={
            <>
              Two minutes.
              <br className="sm:hidden" /> One chain.
            </>
          }
          aside={
            <Link
              to="/games"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy transition-colors hover:text-brand-navyDark"
            >
              All mini games
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          }
        >
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-600">
            A new puzzle lands every day, built on the same roster data as the slate. LeBronnect is
            live today; more games are on the way, and one streak covers all of them.
          </p>
        </SectionHead>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {MINI_GAMES.slice(0, 2).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    </section>
  );
}
