import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { PLAYER_GAME_LOG_PAGE_SIZE, usePlayerGames, type PlayerGameLogEntry } from '../../lib/api';
import { formatDateOnly } from '../../lib/game-utils';
import { Panel } from '../dashboard/shared';

const STAT_COLUMNS: {
  label: string;
  width: string;
  value: (game: PlayerGameLogEntry) => string;
}[] = [
  { label: 'MIN', width: 'w-11', value: (g) => g.minutes ?? '—' },
  { label: 'PTS', width: 'w-8', value: (g) => (g.points == null ? '—' : String(g.points)) },
  { label: 'REB', width: 'w-8', value: (g) => (g.rebounds == null ? '—' : String(g.rebounds)) },
  { label: 'AST', width: 'w-8', value: (g) => (g.assists == null ? '—' : String(g.assists)) },
];

function ResultBadge({ won }: { won: boolean | null }) {
  if (won === null) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-200 text-[11px] font-bold text-stone-500">
        —
      </span>
    );
  }
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white ${
        won ? 'bg-emerald-500' : 'bg-brand-red'
      }`}
    >
      {won ? 'W' : 'L'}
    </span>
  );
}

/**
 * A player's game log, newest first, ten games to a page, each row linking to its
 * game detail page. Games the player did not appear in are excluded by the API,
 * so every row has a line to show.
 */
export function GameLogPanel({ playerId }: { playerId: string }) {
  const [page, setPage] = useState(0);
  const { data, isFetching } = usePlayerGames(playerId, page);

  // A different player is a different log, so start back at the first page.
  useEffect(() => {
    setPage(0);
  }, [playerId]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PLAYER_GAME_LOG_PAGE_SIZE));

  // The total can shrink under a stale page (a traded player's rows are
  // re-attributed), so clamp rather than leaving the reader on an empty page.
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const games = data?.games ?? [];
  const first = total === 0 ? 0 : page * PLAYER_GAME_LOG_PAGE_SIZE + 1;
  const last = page * PLAYER_GAME_LOG_PAGE_SIZE + games.length;

  const go = (next: number) => setPage(Math.min(Math.max(next, 0), pageCount - 1));

  return (
    <Panel title="Game Log">
      {games.length === 0 ? (
        <p className="px-5 py-4 text-sm text-stone-400">No games played on file yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-brand-line px-5 pb-2 pt-3 text-[10px] font-bold uppercase tracking-widest text-stone-500">
            <span className="w-6 shrink-0" aria-hidden="true" />
            <span className="w-6 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">Game</span>
            <span className="flex shrink-0 gap-3">
              {STAT_COLUMNS.map((column) => (
                <span key={column.label} className={`${column.width} text-right`}>
                  {column.label}
                </span>
              ))}
            </span>
          </div>

          <div className={`flex flex-col transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            {games.map((game) => (
              <Link
                key={game.gameId}
                to="/game/$gameId"
                params={{ gameId: game.gameId }}
                className="flex items-center gap-3 border-b border-brand-line px-5 py-2.5 transition-colors last:border-b-0 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy"
              >
                <ResultBadge won={game.won} />
                {game.opponentLogoUrl ? (
                  <img
                    src={game.opponentLogoUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 object-contain"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <span className="h-6 w-6 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-ink">
                    {game.isHome ? 'vs' : '@'} {game.opponentTricode ?? game.opponentName}
                  </span>
                  <span className="block truncate text-xs text-stone-500">
                    {formatDateOnly(game.gameDate, 'EEE, MMM d')}
                  </span>
                </span>
                {STAT_COLUMNS.map((column) => (
                  <span
                    key={column.label}
                    className={`${column.width} shrink-0 text-right text-sm font-semibold tabular-nums text-brand-ink`}
                  >
                    {column.value(game)}
                  </span>
                ))}
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-brand-line px-5 py-2.5">
            <p className="text-xs font-medium tabular-nums text-stone-500">
              {first}–{last} of {total} {total === 1 ? 'game' : 'games'}
            </p>
            <div className="flex items-center gap-1.5">
              {isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" aria-hidden="true" />
              )}
              <button
                type="button"
                aria-label="Previous games"
                disabled={page === 0}
                onClick={() => go(page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-line text-stone-500 transition hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40"
              >
                ‹
              </button>
              <span className="text-xs font-medium tabular-nums text-stone-500">
                Page {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                aria-label="Next games"
                disabled={page >= pageCount - 1}
                onClick={() => go(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-line text-stone-500 transition hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40"
              >
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
