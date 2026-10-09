import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BoxScorePanel } from '../components/gameDetail/BoxScore';
import { useGameBoxscore, type BoxScore } from '../lib/api';

/**
 * Dev-only preview of the box score panel, kept so both ordering rules can be
 * compared while no game is in progress. It renders the real `/games/:id/boxscore`
 * payload for one finished game and lets `status` be flipped to 2, which is the
 * only thing that changes the ordering (feed order vs. by scoring).
 *
 * Safe to delete, along with the `/prototype/boxscore` route entry.
 */
export const Route = createFileRoute('/prototype/boxscore')({
  component: PrototypeBoxScore,
});

const GAME_ID = '0012600033';

function PrototypeBoxScore() {
  const { data, isLoading, error } = useGameBoxscore(GAME_ID);
  const [mode, setMode] = useState<'final' | 'live'>('final');

  const preview: BoxScore | null = data
    ? mode === 'live'
      ? { ...data, status: 2, statusText: 'Q3 05:30', period: 3, gameClock: 'PT05M30.00S' }
      : data
    : null;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-stone-500">
          Preview · game {GAME_ID}
        </span>
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-brand-line bg-white">
          {(['final', 'live'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition ${
                mode === m ? 'bg-brand-navyDark text-white' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-stone-500">Loading box score…</p>}
      {error && <p className="text-sm text-brand-red">{(error as Error).message}</p>}

      {preview && (
        <>
          <BoxScorePanel data={preview} awayColor="#1D428A" homeColor="#E03A3E" />
          <p className="text-xs italic text-stone-500">
            {mode === 'live'
              ? 'Live: status forced to 2 so the feed order is used — starters as listed, then the bench as listed.'
              : 'Final: each group is sorted by points scored.'}
          </p>
        </>
      )}
    </div>
  );
}
