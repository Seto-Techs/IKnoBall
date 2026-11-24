import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  fetchLeaderboard,
  useResource,
  type LeaderboardRow,
  type LeaderboardScope,
  type Me,
  type PredictionMode,
} from '../lib/api';
import { EmptyNote, ErrorNote, Spinner } from '../components/kit';

/**
 * Both boards, modelled on the site's dashboard rail: a ten-row window you scroll
 * through, with your own row pinned to whichever edge you are scrolling away
 * from. The rail is the right shape for an activity — it fits a short window and
 * never makes the viewer hunt for themselves.
 *
 * Each card carries two scopes: the server this activity runs in and everyone.
 * They rank the same players on different fields — your picks are worth the same
 * points either way, so only your place moves — and the header states both, so
 * the switch changes the list without hiding a number.
 *
 * Fifty rows at most, and the cut never lands on you: inside the top fifty you
 * see the fifty, outside it you see the top forty-nine and your own row. The
 * server board is cut shorter than that by its own query, which is why the two
 * scopes can list different people.
 */

/** One list row's height, fixed by `h-12` in `ListRow`. */
const ROW_HEIGHT = 48;

/** The board's ceiling. */
const MAX_ROWS = 50;

/** Rows the window shows when there is room for them; the rest scroll. */
const VIEW_ROWS = 10;

export function Leaderboard({ me }: { me: Me }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">
      <header className="flex shrink-0 items-baseline gap-2">
        <Trophy className="h-5 w-5 shrink-0 translate-y-0.5 text-brand-gold" aria-hidden />
        <h1 className="font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.02em] text-brand-ink">
          Leaderboard
        </h1>
      </header>

      {/* One card per mode, because the two boards rank the same players on
          different arithmetic: a pick that pays 1 pt flat can be worth 3.4
          weighted, so a single combined list would be telling two stories at
          once. Side by side when the window is wide, stacked when it is not. */}
      <div className="grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto overscroll-contain sm:auto-rows-fr sm:grid-cols-2 sm:overflow-hidden">
        <Board me={me} mode="flat" title="Flat" blurb="Every correct pick pays 1 pt." />
        <Board
          me={me}
          mode="weighted"
          title="Weighted"
          blurb="Pays like a 1-unit bet at the odds when you picked."
        />
      </div>
    </div>
  );
}

/**
 * One mode's card: its own read, its own scroll window, and its own pinned
 * viewer row, so scrolling flat never moves weighted.
 *
 * The server board fails soft. It is the narrower read — a guild the bot has not
 * mirrored, or a preview with no guild at all — and losing it should cost the
 * switch, not the global board that sits behind it.
 */
function Board({
  me,
  mode,
  title,
  blurb,
}: {
  me: Me;
  mode: PredictionMode;
  title: string;
  /** How this mode scores, in one line, under the title. */
  blurb: string;
}) {
  const boards = useResource(() => loadScopes(mode), mode);
  const serverRows = boards.data?.server ?? [];
  const globalRows = boards.data?.global ?? [];

  // A server board only exists when there is a guild to rank, so the switch is
  // offered only when it would change something.
  const hasServer = serverRows.length > 0;
  const [wantsServer, setWantsServer] = useState(true);
  const scope: LeaderboardScope = hasServer && wantsServer ? 'server' : 'global';

  const rows = scope === 'server' ? serverRows : globalRows;

  // Rank order comes from the API; the viewer is found by id so a rename or a
  // tie cannot shift the row that belongs to them.
  const meIndex = rows.findIndex((row) => row.userId === me.id);
  const insideTop = meIndex >= 0 && meIndex < MAX_ROWS;

  const shown: LeaderboardRow[] = insideTop
    ? rows.slice(0, MAX_ROWS)
    : meIndex >= 0
      ? [...rows.slice(0, MAX_ROWS - 1), rows[meIndex]]
      : rows.slice(0, MAX_ROWS);

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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-3 pb-1 pt-2">
        <h2 className="font-heading text-[15px] font-semibold uppercase leading-none tracking-[0.06em] text-brand-ink">
          {title}
        </h2>
        <p className="flex items-baseline gap-1.5 text-[11.5px] font-semibold tabular-nums text-brand-navy">
          {rankPair(serverRows, globalRows, me.id, hasServer)}
        </p>
      </div>

      <p className="shrink-0 px-3 pb-1.5 text-[11.5px] leading-snug text-stone-500">{blurb}</p>

      {hasServer && (
        <div
          role="group"
          aria-label={`${title} board scope`}
          className="mx-3 mb-1.5 flex shrink-0 gap-1 rounded-lg bg-stone-100 p-0.5"
        >
          {(['server', 'global'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => {
                setWantsServer(value === 'server');
                // The list is a different board now; starting it at the top is
                // what the player expects, and it re-anchors the pinned row.
                setScrollTop(0);
                listRef.current?.scrollTo({ top: 0 });
              }}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                scope === value
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-stone-500 hover:text-brand-navy'
              }`}
            >
              {value === 'server' ? 'This server' : 'All players'}
            </button>
          ))}
        </div>
      )}

      {boards.loading ? (
        <Spinner label="Loading the board" />
      ) : boards.error ? (
        <ErrorNote message={boards.error} />
      ) : shown.length === 0 ? (
        <EmptyNote message="No settled picks yet." />
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-y border-brand-line bg-stone-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
            <span className="w-7 shrink-0 text-right">#</span>
            <span className="w-8 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Player</span>
            <span className="w-10 shrink-0 text-right">Pts</span>
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
  );
}

/** Both boards for one mode, fetched together so the header can state both ranks. */
function loadScopes(mode: PredictionMode) {
  return Promise.all([
    fetchLeaderboard(mode, 'global'),
    fetchLeaderboard(mode, 'server').catch(() => [] as LeaderboardRow[]),
  ]).then(([global, server]) => ({ global, server }));
}

/**
 * `Srv #1 · Global #1 · 13 pts` — the viewer's place on each board, then the
 * points they hold. Points do not depend on scope: the same picks settle for the
 * same total, so only the rank moves when the scope does.
 */
function rankPair(
  serverRows: LeaderboardRow[],
  globalRows: LeaderboardRow[],
  userId: string,
  hasServer: boolean,
) {
  const server = serverRows.find((row) => row.userId === userId) ?? null;
  const global = globalRows.find((row) => row.userId === userId) ?? null;
  const points = global?.points ?? server?.points ?? 0;

  return (
    <>
      {hasServer && (
        <>
          <span className="text-stone-500">Srv</span>
          <span>{server ? `#${server.rank}` : '—'}</span>
          <span className="text-stone-300">·</span>
        </>
      )}
      <span className="text-stone-500">Global</span>
      <span>{global ? `#${global.rank}` : '—'}</span>
      <span className="text-stone-300">·</span>
      <span>{points} pts</span>
    </>
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
      className={`flex h-12 items-center gap-2 px-3 ${
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
        className={`w-10 shrink-0 text-right text-[15px] font-semibold tabular-nums ${
          isViewer ? 'text-white' : 'text-stone-700'
        }`}
      >
        {row.points}
      </span>
    </div>
  );
}
