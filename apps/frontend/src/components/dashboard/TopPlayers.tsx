import { useState } from 'react';
import type { PlayerStat } from '../../lib/api';
import { Panel, LoadingSpinner, EmptyState } from './shared';

const STATS = [
  { key: 'points', label: 'Points', unit: 'PTS' },
  { key: 'rebounds', label: 'Rebounds', unit: 'REB' },
  { key: 'assists', label: 'Assists', unit: 'AST' },
] as const;

type StatKey = (typeof STATS)[number]['key'];

const RANK_CHIPS = [
  'bg-brand-gold text-brand-navyDark',
  'bg-stone-300 text-stone-700',
  'bg-amber-600 text-amber-950',
];

function PlayerCard({
  player,
  rank,
  stat,
  unit,
}: {
  player: PlayerStat;
  rank: number;
  stat: StatKey;
  unit: string;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-lg border bg-white ${
        rank === 1 ? 'border-brand-gold/70' : 'border-brand-line'
      }`}
    >
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-brand-navy/5">
        <span className="font-heading text-5xl font-semibold text-brand-navy/15">
          {player.name.charAt(0)}
        </span>
        {player.imageUrl && (
          <img
            src={player.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <span
          className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold ${RANK_CHIPS[rank - 1]}`}
        >
          {rank}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-brand-line px-3 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-brand-ink" title={player.name}>
            {player.name}
          </span>
          <span className="block text-sm text-stone-500">{player.position}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-heading text-2xl font-semibold leading-none tabular-nums text-brand-ink">
            {player[stat].toFixed(1)}
          </span>
          <span className="mt-1 block text-sm font-medium text-stone-500">{unit}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * League leaders by stat category: a dropdown filters points/rebounds/assists
 * and the top 3 players are shown as trading-card style headshot cards.
 */
export function TopPlayersPanel({
  players,
  loading = false,
}: {
  players?: PlayerStat[];
  loading?: boolean;
}) {
  const [stat, setStat] = useState<StatKey>('points');
  const active = STATS.find((s) => s.key === stat)!;
  const top3 = [...(players ?? [])].sort((a, b) => b[stat] - a[stat]).slice(0, 3);

  return (
    <Panel title="Top Players">
      {loading ? (
        <LoadingSpinner />
      ) : players && players.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-stone-600">
              Top 3 by
            </span>
            <label className="sr-only" htmlFor="top-player-stat">
              Stat category
            </label>
            <select
              id="top-player-stat"
              value={stat}
              onChange={(e) => setStat(e.target.value as StatKey)}
              className="rounded-md border border-brand-line bg-white px-3 py-1.5 text-base font-medium text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              {STATS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <ul className="grid grid-cols-3 gap-3 p-4">
            {top3.map((player, index) => (
              <li key={player.id} className="min-w-0">
                <PlayerCard player={player} rank={index + 1} stat={stat} unit={active.unit} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState message="Run the worker to sync player stats." />
      )}
    </Panel>
  );
}
