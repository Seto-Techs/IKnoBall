import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import type { PredictionMode } from '../../lib/api';
import { formatPoints, potentialPoints } from './predictions';
import {
  buildPickSeasons,
  rowSeason,
  verdictOf,
  type PickHistoryRow,
  type PickSeason,
  type PickVerdict,
} from './history';

type ResultFilter = 'all' | 'correct' | 'missed' | 'open';

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'correct', label: 'Correct' },
  { key: 'missed', label: 'Missed' },
  { key: 'open', label: 'Open' },
];

const VERDICT_STYLE: Record<PickVerdict, { label: string; className: string }> = {
  correct: { label: '✓ Correct', className: 'bg-emerald-500/15 text-emerald-700' },
  missed: { label: '✗ Missed', className: 'bg-brand-red/10 text-brand-red' },
  open: { label: 'Open', className: 'bg-brand-navy/10 text-brand-navy' },
  pending: { label: 'Pending', className: 'bg-stone-100 text-stone-500' },
  void: { label: 'Void', className: 'bg-stone-100 text-stone-500' },
};

const MODE_ORDER: Record<PredictionMode, number> = { flat: 0, weighted: 1 };

/** Rows per page. Enough to read a week without scrolling a whole season. */
const PAGE_SIZE = 15;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/New_York',
});

// With every season in one table, a bare "Oct 11" is ambiguous across years.
const datedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
});

/** `LAL @ GSW`, falling back to whatever the payload has. */
function matchupOf(row: PickHistoryRow): { away: string; home: string } {
  return {
    away: row.awayTricode ?? (row.awayTeam ?? '?').slice(0, 3).toUpperCase(),
    home: row.homeTricode ?? (row.homeTeam ?? '?').slice(0, 3).toUpperCase(),
  };
}

/** A season filter, rendered as a dropdown rather than a chip row. */
function SeasonFilter({
  seasons,
  value,
  onChange,
}: {
  seasons: PickSeason[];
  value: string;
  onChange: (season: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = value === 'all' ? 'All seasons' : value;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="season-filter-menu"
        aria-label={`Season filter: ${label}`}
        className="flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-[11px] font-bold tabular-nums uppercase tracking-widest text-brand-ink transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="season-filter-menu"
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[200px] overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
        >
          {seasons.map((entry) => (
            <button
              key={entry.season}
              type="button"
              role="menuitemradio"
              aria-checked={value === entry.season}
              onClick={() => {
                setOpen(false);
                onChange(entry.season);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                value === entry.season
                  ? 'bg-brand-navy/5 text-brand-navy'
                  : 'text-brand-ink hover:bg-stone-50'
              }`}
            >
              <span className="flex-1 text-[11px] font-bold tabular-nums uppercase tracking-widest">
                {entry.season === 'all' ? 'All seasons' : entry.season}
              </span>
              <span className="text-[10px] font-bold tabular-nums uppercase tracking-widest text-stone-400">
                {entry.games}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Every pick the user holds, one row per game, newest first.
 *
 * A different lens on the same data as the week rail: the rail is for reading a
 * slate, this is for auditing your record — which team, which day, and how it
 * went, without paging a calendar to find it.
 */
export function MyPicksPanel({ rows }: { rows: PickHistoryRow[] }) {
  const [season, setSeason] = useState<string>('all');
  const [result, setResult] = useState<ResultFilter>('all');
  const [page, setPage] = useState(0);

  const seasons = useMemo(() => buildPickSeasons(rows), [rows]);
  // "All seasons" carries the total, so the count column reads as a column
  // rather than leaving the selected row blank.
  const seasonOptions = useMemo<PickSeason[]>(
    () => [
      {
        season: 'all',
        games: rows.length ? new Set(rows.map((row) => row.gameId)).size : 0,
        settled: 0,
        correct: 0,
      },
      ...seasons,
    ],
    [rows, seasons],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (season !== 'all' && rowSeason(row) !== season) return false;
        if (result === 'all') return true;
        const verdict = verdictOf(row);
        if (result === 'open') return verdict === 'open' || verdict === 'pending';
        return verdict === result;
      }),
    [rows, season, result],
  );

  // One row per game: a pick writes a flat and a weighted row, and both always
  // name the same side, so the game is the unit worth listing.
  const games = useMemo(() => {
    const byGame = new Map<string, PickHistoryRow[]>();
    for (const row of filtered) {
      const bucket = byGame.get(row.gameId);
      if (bucket) bucket.push(row);
      else byGame.set(row.gameId, [row]);
    }
    return [...byGame.values()]
      .map((group) => ({
        rows: [...group].sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode]),
        time: new Date(group[0].gameDateTime ?? 0).getTime(),
      }))
      .sort((a, b) => b.time - a.time);
  }, [filtered]);

  const totals = useMemo(() => {
    const settled = new Set(
      filtered.filter((row) => row.status === 'settled').map((row) => row.gameId),
    );
    const correct = new Set(
      filtered
        .filter((row) => row.status === 'settled' && (row.points ?? 0) > 0)
        .map((row) => row.gameId),
    );
    const points = filtered.reduce((sum, row) => sum + (row.points ?? 0), 0);
    return { settled: settled.size, correct: correct.size, points };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  // Filters can shrink the list under the current page, so clamp rather than
  // render an empty page with the pager claiming there are more.
  const safePage = Math.min(page, pageCount - 1);
  const pageGames = games.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const firstShown = games.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const lastShown = safePage * PAGE_SIZE + pageGames.length;

  const resetPage = (apply: () => void) => {
    apply();
    setPage(0);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-line px-5 py-3">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold uppercase tracking-wide text-brand-ink">
          <ListChecks className="h-5 w-5 text-brand-navy" aria-hidden="true" />
          My picks
        </h2>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-stone-600">
          {games.length} {games.length === 1 ? 'game' : 'games'} ·{' '}
          {totals.settled > 0 ? `${totals.correct}✓ ${totals.settled - totals.correct}✗` : '—'} ·{' '}
          {totals.points} pts
        </span>
      </div>

      {/* Filters are only meaningful once there are picks to filter. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-line px-5 py-2">
          <SeasonFilter
            seasons={seasonOptions}
            value={season}
            onChange={(next) => resetPage(() => setSeason(next))}
          />

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-brand-line bg-stone-50 p-0.5">
            {RESULT_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => resetPage(() => setResult(option.key))}
                aria-pressed={result === option.key}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest transition ${
                  result === option.key
                    ? 'bg-white text-brand-ink shadow-sm'
                    : 'text-stone-500 hover:text-brand-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {games.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-stone-500">
          {rows.length === 0
            ? 'No picks yet — make your first pick from the slate.'
            : 'No picks match these filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-brand-line bg-stone-50">
                <th
                  scope="col"
                  className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Matchup
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Score
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Picked
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Flat
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Weighted
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                >
                  Result
                </th>
                <th scope="col" className="w-8 px-3 py-2">
                  <span className="sr-only">Open game</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {pageGames.map((group) => {
                const [row] = group.rows;
                const { away, home } = matchupOf(row);
                const picked = row.side === 'away' ? away : home;
                const verdict = VERDICT_STYLE[verdictOf(row)];
                // Only a started game has a score; the schedule carries 0–0 for
                // anything not yet tipped, which would read as a real result.
                const played =
                  (row.gameStatus === 2 || row.gameStatus === 3) &&
                  row.awayScore != null &&
                  row.homeScore != null;
                const byMode = (mode: PredictionMode) =>
                  group.rows.find((entry) => entry.mode === mode) ?? null;

                return (
                  <tr key={row.gameId} className="group transition hover:bg-stone-50">
                    <td className="whitespace-nowrap px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                      {row.gameDateTime
                        ? season === 'all'
                          ? datedFormatter.format(new Date(row.gameDateTime))
                          : dateFormatter.format(new Date(row.gameDateTime))
                        : 'Unknown'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-heading text-base font-black tracking-wide text-brand-ink">
                      {away}
                      <span className="mx-1 text-[11px] font-bold text-stone-400">@</span>
                      {home}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs font-bold tabular-nums text-stone-600">
                      {played ? `${row.awayScore}–${row.homeScore}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded-full bg-brand-gold/20 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-brand-ink ring-1 ring-brand-gold/40">
                        {picked}
                      </span>
                    </td>
                    {(['flat', 'weighted'] as const).map((mode) => {
                      const entry = byMode(mode);
                      // Settled rows show what they scored. Unsettled rows show
                      // what the pick would pay, muted — keeping one unit in the
                      // column instead of mixing points with a locked price.
                      const settled = entry?.status === 'settled';
                      const value = settled
                        ? (entry?.points ?? null)
                        : entry
                          ? potentialPoints(mode, entry.lockedDecimal)
                          : null;
                      return (
                        <td
                          key={mode}
                          className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold tabular-nums text-brand-ink"
                        >
                          {value === null ? (
                            <span className="text-stone-400">—</span>
                          ) : (
                            // stone-500 rather than 400: the projection is real
                            // data, so it still has to clear AA contrast.
                            <span className={settled ? '' : 'text-stone-500'}>
                              {formatPoints(value)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`inline-block w-24 rounded-full px-2.5 py-1 text-center text-[11px] font-black uppercase tracking-widest ${verdict.className}`}
                      >
                        {verdict.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to="/game/$gameId"
                        params={{ gameId: row.gameId }}
                        aria-label={`Open ${away} at ${home}`}
                        className="flex items-center justify-center rounded-md p-1 text-stone-300 transition group-hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {games.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-brand-line px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
            Showing {firstShown}–{lastShown} of {games.length}
          </p>
          <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-line text-brand-ink transition hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {Array.from({ length: pageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-current={index === safePage ? 'page' : undefined}
                aria-label={`Page ${index + 1}`}
                className={`h-8 min-w-8 rounded-md border px-2 text-[11px] font-black tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  index === safePage
                    ? 'border-brand-navyDark bg-brand-navyDark text-white'
                    : 'border-brand-line text-brand-ink hover:bg-stone-50'
                }`}
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-line text-brand-ink transition hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
