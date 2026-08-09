import { useRef } from 'react';
import { nbaTeams } from '../../config/nba-teams';
import type { TeamWithLeaders } from '../../lib/api';
import { formatGameDate, Panel, LoadingSpinner, EmptyState } from './shared';

export function UpcomingGamesPanel({
  games,
  loading = false,
  userTeam,
}: {
  games?: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    gameDateTime: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  loading?: boolean;
  userTeam?: TeamWithLeaders | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const findTeam = (name: string) =>
    nbaTeams.find((t) => t.fullName === name || t.teamName === name || t.abbreviation === name);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -280 : 280;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <Panel title="Upcoming Matches">
      {loading ? (
        <LoadingSpinner />
      ) : games && games.length > 0 ? (
        <div className="relative h-full">
          <div ref={scrollRef} className="flex h-full w-full overflow-x-auto scrollbar-hide">
            {games.map((game, i) => {
              const home = findTeam(game.homeTeam);
              const away = findTeam(game.awayTeam);
              const isLive = game.status.toLowerCase() === 'live';
              const isHome =
                game.homeTeam === userTeam?.fullName || game.homeTeam === userTeam?.teamName;

              return (
                <div key={game.id} className="flex h-full">
                  {i > 0 && <div className="w-px shrink-0 self-stretch bg-brand-line" />}
                  <div className="flex h-full w-full flex-1 flex-col justify-between px-10 py-6">
                    <span className="text-sm font-semibold uppercase tracking-wider text-stone-600">
                      NBA · {isHome ? 'Home' : 'Away'}
                    </span>

                    <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-8">
                      <div className="flex flex-col items-center gap-3">
                        {home?.logoUrl && (
                          <img
                            src={home.logoUrl}
                            alt=""
                            className="h-28 w-28 object-contain"
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-center text-lg font-semibold text-brand-ink">
                          {home?.abbreviation ?? game.homeTeam}
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        {isLive && game.homeScore !== null && game.awayScore !== null ? (
                          <span className="whitespace-nowrap font-heading text-5xl font-semibold tabular-nums leading-none text-brand-ink">
                            {game.awayScore} - {game.homeScore}
                          </span>
                        ) : (
                          <span className="font-heading text-5xl font-medium leading-none text-stone-500">
                            vs
                          </span>
                        )}
                        <span
                          className={`mt-1 rounded px-3 py-1 text-sm font-semibold uppercase ${isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'}`}
                        >
                          {game.status}
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-3">
                        {away?.logoUrl && (
                          <img
                            src={away.logoUrl}
                            alt=""
                            className="h-28 w-28 object-contain"
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-center text-lg font-semibold text-brand-ink">
                          {away?.abbreviation ?? game.awayTeam}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-stone-600">
                      {formatGameDate(game.gameDateTime, 'EEE, MMM d · h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-line bg-white text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-ink"
            aria-label="Scroll left"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-line bg-white text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-ink"
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      ) : (
        <EmptyState message="No upcoming games." />
      )}
    </Panel>
  );
}
