import { useRef } from 'react';
import { Panel, LoadingSpinner, EmptyState } from './shared';

export function TopPlayersPanel({
  players,
  loading = false,
}: {
  players?: { id: string; name: string; position: string; points: number; rebounds: number; assists: number; imageUrl?: string }[];
  loading?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -scrollRef.current.clientWidth : scrollRef.current.clientWidth;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <Panel title="Top Players" className="min-h-72">
      {loading ? (
        <LoadingSpinner />
      ) : players && players.length > 0 ? (
        <div className="relative flex-1">
          <div ref={scrollRef} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide">
            {players.slice(0, 5).map((player, index) => (
              <div key={player.id} className="flex w-full shrink-0 snap-center items-center gap-8 px-10 py-8">
                <div className="relative shrink-0">
                  <span className={`absolute -left-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-brand-red text-white' : 'bg-stone-200 text-stone-600'}`}>
                    {index + 1}
                  </span>
                  {player.imageUrl ? (
                    <img
                      src={player.imageUrl}
                      alt={player.name}
                      className="h-48 w-36 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-48 w-36 items-center justify-center rounded-lg bg-stone-100" />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-5">
                  <div>
                    <h3 className="font-heading text-3xl font-semibold uppercase tracking-wide text-brand-ink">
                      {player.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                      {player.position}
                    </p>
                  </div>

                  <div className="flex items-center">
                    <div className="flex-1">
                      <p className="font-heading text-5xl font-semibold leading-none tabular-nums text-brand-ink">
                        {player.points.toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">PTS</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-heading text-5xl font-semibold leading-none tabular-nums text-brand-ink">
                        {player.rebounds.toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">REB</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-heading text-5xl font-semibold leading-none tabular-nums text-brand-ink">
                        {player.assists.toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">AST</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => scroll('left')} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-line bg-white text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-ink" aria-label="Previous">
            ‹
          </button>
          <button type="button" onClick={() => scroll('right')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-line bg-white text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-ink" aria-label="Next">
            ›
          </button>
        </div>
      ) : (
        <EmptyState message="Run the worker to sync player stats." />
      )}
    </Panel>
  );
}
