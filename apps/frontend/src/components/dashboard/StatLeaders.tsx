import { useState } from 'react';
import type { PlayerStat } from '../../lib/api';
import { EmptyState, LoadingSpinner, Panel } from './shared';

type Timeframe = 'perGame' | 'total';

interface StatCategory {
  key: string;
  label: string;
  perGame: (p: PlayerStat) => number;
  total: (p: PlayerStat) => number;
}

const CATEGORIES: StatCategory[] = [
  { key: 'pts', label: 'PTS', perGame: (p) => p.points, total: (p) => p.pointsTotal },
  { key: 'reb', label: 'REB', perGame: (p) => p.rebounds, total: (p) => p.reboundsTotal },
  { key: 'ast', label: 'AST', perGame: (p) => p.assists, total: (p) => p.assistsTotal },
  { key: 'stl', label: 'STL', perGame: (p) => p.steals, total: (p) => p.stealsTotal },
  { key: 'blk', label: 'BLK', perGame: (p) => p.blocks, total: (p) => p.blocksTotal },
];

// Tailwind needs static class names; extend when categories change. Five
// columns of headshot + value + name need ~144px each, so the podium only
// starts at md — below that the categories stack into a list.
const GRID_COLS: Record<number, string> = {
  3: 'md:grid-cols-3',
  5: 'md:grid-cols-5',
};

function leaderOf(
  players: PlayerStat[],
  category: StatCategory,
  timeframe: Timeframe,
): PlayerStat | null {
  const valueOf = timeframe === 'perGame' ? category.perGame : category.total;
  let best: PlayerStat | null = null;
  let bestValue = -Infinity;
  for (const p of players) {
    const v = valueOf(p);
    if (v > bestValue) {
      bestValue = v;
      best = p;
    }
  }
  return best;
}

export function StatLeadersPanel({
  players,
  loading = false,
}: {
  players?: PlayerStat[];
  loading?: boolean;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('perGame');

  return (
    <Panel title="Stat Leaders">
      {loading ? (
        <LoadingSpinner />
      ) : players && players.length > 0 ? (
        <>
          <div className="flex justify-end px-5 pt-3">
            <div className="flex rounded-md border border-brand-line p-0.5">
              {(['perGame', 'total'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  aria-pressed={timeframe === tf}
                  className={`rounded px-3 py-1 text-sm font-semibold transition-colors ${
                    timeframe === tf
                      ? 'bg-brand-navy text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {tf === 'perGame' ? 'Per Game' : 'Total'}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`flex flex-col divide-y divide-brand-line ${GRID_COLS[CATEGORIES.length] ?? 'md:grid-cols-3'} md:grid md:divide-x md:divide-y-0`}
          >
            {CATEGORIES.map((cat) => {
              const leader = leaderOf(players, cat, timeframe);
              const value = leader
                ? timeframe === 'perGame'
                  ? cat.perGame(leader)
                  : cat.total(leader)
                : null;
              // Null data (columns not backfilled yet) renders as 0 — show '—' instead.
              const hasData = value !== null && value > 0;
              return (
                <div
                  key={cat.key}
                  className="flex items-center gap-3 px-5 py-3 text-left md:flex-col md:items-center md:gap-2 md:px-3 md:py-6 md:text-center"
                >
                  <span className="w-9 shrink-0 text-[11px] font-bold uppercase tracking-wider text-stone-500 md:w-auto md:text-xs md:tracking-[0.2em]">
                    {cat.label}
                  </span>
                  {hasData ? (
                    <>
                      {leader!.headshotUrl ? (
                        <img
                          src={leader!.headshotUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-11 w-11 shrink-0 rounded-lg object-cover md:h-20 md:w-28"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-lg bg-stone-100 md:h-20 md:w-28" />
                      )}
                      {/* Last in the mobile list (pushed right of the name), third in the podium. */}
                      <p className="order-last font-heading text-2xl font-semibold leading-none tabular-nums text-brand-ink md:order-none md:text-4xl">
                        {timeframe === 'perGame' ? value!.toFixed(1) : Math.round(value!)}
                      </p>
                      <div className="flex min-w-0 flex-1 flex-col md:flex-none md:items-center">
                        <p className="break-words text-sm font-semibold leading-snug text-brand-ink md:text-base">
                          {leader!.name}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 md:text-xs">
                          {leader!.position}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-11 w-11 shrink-0 rounded-lg bg-stone-100 md:h-20 md:w-28" />
                      <span className="order-last text-stone-400 md:order-none md:py-4">—</span>
                      <div className="min-w-0 flex-1 md:hidden" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState message="Run the worker to sync player stats." />
      )}
    </Panel>
  );
}
