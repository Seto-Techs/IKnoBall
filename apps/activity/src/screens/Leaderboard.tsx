import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { fetchLeaderboard, useResource, type LeaderboardRow, type Me } from '../lib/api';
import { EmptyNote, ErrorNote, Spinner } from '../components/kit';

/**
 * The board, modelled on the site's dashboard rail: a ten-row window you scroll
 * through, with your own row pinned to whichever edge you are scrolling away
 * from. The rail is the right shape for an activity — it fits a short window and
 * never makes the viewer hunt for themselves.
 *
 * Fifty rows at most, and the cut never lands on you: inside the top fifty you
 * see the fifty, outside it you see the top forty-nine and your own row.
 */

/** One list row's height, fixed by `h-12` in `ListRow`. */
const ROW_HEIGHT = 48;

/** The board's ceiling. */
const MAX_ROWS = 50;

/** Rows the window shows when there is room for them; the rest scroll. */
const VIEW_ROWS = 10;

export function Leaderboard({ me }: { me: Me }) {
  const board = useResource(fetchLeaderboard);
  const rows = board.data ?? [];

  // Rank order comes from the API; the viewer is found by id so a rename or a
  // tie cannot shift the row that belongs to them.
  const meIndex = rows.findIndex((row) => row.userId === me.id);
  const insideTop = meIndex >= 0 && meIndex < MAX_ROWS;

  const shown: LeaderboardRow[] = insideTop
    ? rows.slice(0, MAX_ROWS)
    : meIndex >= 0
      ? [...rows.slice(0, MAX_ROWS - 1), rows[meIndex]]
      : rows.slice(0, MAX_ROWS);

  const viewerRow = meIndex >= 0 ? rows[meIndex] : null;
  const viewerIndex = insideTop || meIndex < 0 ? meIndex : MAX_ROWS - 1;

  const listRef = useRef<HTMLDivElement | null>(null);
  const [windowHeight, setWindowHeight] = useState(VIEW_ROWS * ROW_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);

  // The window is measured rather than assumed: a mobile-landscape activity is
  // about 390px tall, so ten rows do not fit and the pinned row has to be placed
  // against the rows that are actually on screen.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setWindowHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleRows = Math.max(3, Math.floor(windowHeight / ROW_HEIGHT));
  const firstVisible = Math.round(scrollTop / ROW_HEIGHT);
  const lastVisible = firstVisible + visibleRows - 1;

  // Above the window the viewer sticks to the top, below it to the bottom, and
  // while they are on screen the row simply sits where it belongs.
  const pin: 'top' | 'bottom' | null =
    viewerIndex < 0
      ? null
      : viewerIndex < firstVisible
        ? 'top'
        : viewerIndex > lastVisible
          ? 'bottom'
          : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <Trophy className="h-5 w-5 shrink-0 translate-y-0.5 text-brand-gold" aria-hidden />
          <h1 className="font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.02em] text-brand-ink">
            Leaderboard
          </h1>
        </div>
        <p className="text-[13px] font-semibold text-brand-navy">
          {viewerRow
            ? `You’re #${viewerRow.rank} · ${viewerRow.points} pts`
            : rows.length > 0
              ? 'Not on the board yet'
              : 'No settled picks yet'}
        </p>
      </header>

      <p className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Flat picks · all players · top {MAX_ROWS}
      </p>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        {board.loading ? (
          <Spinner label="Loading the board" />
        ) : board.error ? (
          <ErrorNote message={board.error} />
        ) : shown.length === 0 ? (
          <EmptyNote message="No settled picks yet. The board fills in once the first games are scored." />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-brand-line bg-stone-50 px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-stone-500">
              <span className="w-7 shrink-0 text-right">#</span>
              <span className="w-8 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">Player</span>
              <span className="w-12 shrink-0 text-right">Pts</span>
            </div>

            <div
              ref={listRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              style={{ maxHeight: VIEW_ROWS * ROW_HEIGHT }}
            >
              <ul>
                {shown.map((row, index) => {
                  const isViewer = row.userId === me.id;
                  const pinned = isViewer && pin !== null;
                  return (
                    <li
                      key={`${row.rank}-${row.userId}`}
                      className={
                        pinned
                          ? `sticky z-10 shadow-[0_4px_12px_rgba(0,0,0,0.12),0_-4px_12px_rgba(0,0,0,0.12)] ${
                              pin === 'top' ? 'top-0' : 'bottom-0'
                            }`
                          : undefined
                      }
                    >
                      <ListRow row={row} isViewer={isViewer} position={index} />
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </section>

      <p className="shrink-0 text-center text-[12px] leading-relaxed text-stone-500">
        Flat picks pay 1 pt each · points settle after the final buzzer
      </p>
    </div>
  );
}

function ListRow({
  row,
  isViewer,
  position,
}: {
  row: LeaderboardRow;
  isViewer: boolean;
  /** Zero-based place in the list, which is what the scroll window counts in. */
  position: number;
}) {
  const medal =
    row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : null;
  const medalRow =
    medal === 'gold'
      ? 'bg-yellow-50'
      : medal === 'silver'
        ? 'bg-stone-50'
        : medal === 'bronze'
          ? 'bg-orange-50'
          : 'bg-white';
  const medalEdge =
    medal === 'gold'
      ? 'border-l-4 border-brand-gold'
      : medal === 'silver'
        ? 'border-l-4 border-stone-400'
        : medal === 'bronze'
          ? 'border-l-4 border-amber-700'
          : 'border-l-4 border-transparent';

  return (
    <div
      data-position={position}
      className={`flex h-12 items-center gap-2 px-4 ${
        isViewer ? 'border-l-4 border-brand-gold bg-brand-navy' : `${medalEdge} ${medalRow}`
      }`}
    >
      <span
        className={`w-7 shrink-0 text-right text-[14px] font-semibold tabular-nums ${
          isViewer
            ? 'text-brand-gold'
            : medal === 'gold'
              ? 'font-bold text-brand-gold'
              : medal === 'silver'
                ? 'font-bold text-stone-500'
                : medal === 'bronze'
                  ? 'font-bold text-amber-700'
                  : 'text-stone-500'
        }`}
      >
        {row.rank}
      </span>

      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-bold ${
          isViewer
            ? 'bg-brand-gold text-brand-navyDark'
            : medal === 'gold'
              ? 'bg-brand-gold/20 text-brand-navyDark'
              : medal === 'silver'
                ? 'bg-stone-200 text-stone-600'
                : medal === 'bronze'
                  ? 'bg-amber-700/15 text-amber-800'
                  : 'bg-brand-navy/10 text-brand-navy'
        }`}
        aria-hidden
      >
        {row.name.charAt(0).toUpperCase()}
      </span>

      <span
        className={`min-w-0 flex-1 truncate text-[15px] ${
          isViewer
            ? 'font-semibold text-white'
            : medal
              ? 'font-semibold text-brand-ink'
              : 'font-medium text-brand-ink'
        }`}
      >
        {row.name}
        {isViewer && <span className="ml-1.5 text-[12px] font-semibold text-brand-gold">you</span>}
      </span>

      <span
        className={`w-12 shrink-0 text-right text-[15px] font-semibold tabular-nums ${
          isViewer ? 'text-white' : 'text-stone-700'
        }`}
      >
        {row.points}
      </span>
    </div>
  );
}
