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

// Tailwind needs static class names; extend when categories change.
const GRID_COLS: Record<number, string> = {
  3: 'grid-cols-3',
  5: 'grid-cols-5',
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
            className={`grid ${GRID_COLS[CATEGORIES.length] ?? 'grid-cols-3'} divide-x divide-brand-line`}
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
                  className="flex flex-col items-center gap-2 px-4 py-6 text-center"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                    {cat.label}
                  </span>
                  {hasData ? (
                    <>
                      {leader!.headshotUrl ? (
                        <img
                          src={leader!.headshotUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-20 w-28 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-28 items-center justify-center rounded-lg bg-stone-100" />
                      )}
                      <p className="font-heading text-4xl font-semibold leading-none tabular-nums text-brand-ink">
                        {timeframe === 'perGame' ? value!.toFixed(1) : Math.round(value!)}
                      </p>
                      <p className="text-base font-semibold text-brand-ink">{leader!.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {leader!.position}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex h-20 w-28 items-center justify-center rounded-lg bg-stone-100" />
                      <span className="py-4 text-stone-400">—</span>
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
