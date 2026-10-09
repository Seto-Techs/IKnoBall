import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import {
  useSearch,
  type SearchGameHit,
  type SearchPlayerHit,
  type SearchResults,
  type SearchTeamHit,
} from '../../lib/api';
import { formatGameDate, formatTimeET } from '../../lib/game-utils';

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2';

type Row =
  | { kind: 'team'; key: string; team: SearchTeamHit }
  | { kind: 'player'; key: string; player: SearchPlayerHit }
  | { kind: 'game'; key: string; game: SearchGameHit };

type Group = { label: string; rows: { row: Row; index: number }[] };

/**
 * Every result resolves to a game: games by id, teams and players by their next
 * tip-off. That is the only navigable destination in the app today — there is no
 * team or player route yet — so a row without one renders as non-interactive.
 */
function rowGameId(row: Row): string | null {
  if (row.kind === 'game') return row.game.id;
  if (row.kind === 'team') return row.team.nextGame?.id ?? null;
  return row.player.nextGame?.id ?? null;
}

function buildRows(results: SearchResults | undefined): Row[] {
  if (!results) return [];
  return [
    ...results.teams.map((team): Row => ({ kind: 'team', key: `team-${team.abbreviation}`, team })),
    ...results.players.map(
      (player): Row => ({ kind: 'player', key: `player-${player.id}`, player }),
    ),
    ...results.games.map((game): Row => ({ kind: 'game', key: `game-${game.id}`, game })),
  ];
}

function useGroups(rows: Row[]): Group[] {
  return useMemo(() => {
    const groups: Group[] = [];
    let index = 0;
    const add = (label: string, matching: Row[]) => {
      if (matching.length === 0) return;
      groups.push({ label, rows: matching.map((row) => ({ row, index: index++ })) });
    };
    // buildRows already emits teams → players → games, so filtering keeps the
    // flat index in step with the group order.
    add(
      'Teams',
      rows.filter((row) => row.kind === 'team'),
    );
    add(
      'Players',
      rows.filter((row) => row.kind === 'player'),
    );
    add(
      'Games',
      rows.filter((row) => row.kind === 'game'),
    );
    return groups;
  }, [rows]);
}

function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useSearch(debounced);
  const rows = useMemo(() => buildRows(data), [data]);
  const groups = useGroups(rows);

  useEffect(() => {
    setActiveIndex(rows.length > 0 ? 0 : -1);
  }, [rows]);

  const reset = useCallback(() => {
    setQuery('');
    setDebounced('');
    setActiveIndex(-1);
  }, []);

  return {
    query,
    setQuery,
    debounced,
    isFetching,
    rows,
    groups,
    activeIndex,
    setActiveIndex,
    reset,
  };
}

/** Whether the shortcut should be handled by the desktop field or the mobile sheet. */
function isDesktopViewport(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

/** Shared '/' + Cmd/Ctrl-K handling. Only one of the two search surfaces acts. */
function useSearchShortcut(enabled: boolean, onTrigger: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isDesktopViewport() !== enabled) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isSlash && !isCommandK) return;
      event.preventDefault();
      onTrigger();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, onTrigger]);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-brand-gold/30 text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function tricodeOr(tricode: string | null, teamName: string): string {
  return tricode ?? teamName.slice(0, 3).toUpperCase();
}

/** Circular avatar that falls back to text when the remote image fails to load. */
function RowAvatar({
  src,
  fallback,
  color,
  className,
  imgClassName,
}: {
  src: string | null;
  fallback: string;
  color?: string | null;
  className: string;
  imgClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={className} style={color ? { backgroundColor: color } : undefined}>
      {src && !failed ? (
        <img src={src} alt="" className={imgClassName} onError={() => setFailed(true)} />
      ) : (
        fallback
      )}
    </span>
  );
}

function NextGameHint({ game }: { game: SearchGameHit | null }) {
  if (!game) {
    return (
      <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:block">
        No upcoming game
      </span>
    );
  }
  return (
    <span className="hidden shrink-0 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:block">
      Next {tricodeOr(game.awayTricode, game.awayTeam)}@{tricodeOr(game.homeTricode, game.homeTeam)}
      <span className="block font-medium normal-case tracking-normal">
        {formatGameDate(game.gameDateTime, 'EEE, MMM d')}
      </span>
    </span>
  );
}

function RowBody({ row, query }: { row: Row; query: string }) {
  if (row.kind === 'team') {
    const { team } = row;
    return (
      <>
        <RowAvatar
          src={team.logoUrl}
          fallback={team.abbreviation}
          color={team.primaryColor ?? '#1C4188'}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full p-1.5 text-[10px] font-black text-white"
          imgClassName="h-full w-full object-contain"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-brand-ink">
            <Highlight text={team.fullName} query={query} />
          </span>
          <span className="block truncate text-xs text-stone-500">
            {team.conference}ern · {team.division}
          </span>
        </span>
        <NextGameHint game={team.nextGame} />
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
      </>
    );
  }

  if (row.kind === 'player') {
    const { player } = row;
    return (
      <>
        <RowAvatar
          src={player.headshotUrl}
          fallback={player.name.slice(0, 2).toUpperCase()}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-100 text-[10px] font-black text-stone-500"
          imgClassName="h-full w-full object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-brand-ink">
            <Highlight text={player.name} query={query} />
          </span>
          <span className="block truncate text-xs text-stone-500">
            {[player.teamName, player.position].filter(Boolean).join(' · ') || 'Free agent'}
          </span>
        </span>
        <NextGameHint game={player.nextGame} />
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
      </>
    );
  }

  const { game } = row;
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navyDark p-0.5">
        <img src="/nba-logo.svg" alt="" className="h-full w-full object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-brand-ink">
          {tricodeOr(game.awayTricode, game.awayTeam)} @{' '}
          {tricodeOr(game.homeTricode, game.homeTeam)}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {formatGameDate(game.gameDateTime, 'EEE, MMM d')} · {formatTimeET(game.gameDateTime)} ET
          {game.arenaName ? ` · ${game.arenaName}` : ''}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
    </>
  );
}

function ResultRow({
  row,
  query,
  index,
  active,
  listboxId,
  onHover,
  onSelect,
}: {
  row: Row;
  query: string;
  index: number;
  active: boolean;
  listboxId: string;
  onHover: () => void;
  onSelect: () => void;
}) {
  const gameId = rowGameId(row);
  const optionId = `${listboxId}-option-${index}`;
  const wrapperClass = `px-4 py-2.5 transition-colors ${active ? 'bg-stone-100' : ''}`;

  // The option wrapper carries the ARIA; the inner link keeps native link semantics.
  if (!gameId) {
    return (
      <div
        id={optionId}
        role="option"
        aria-selected={active}
        aria-disabled="true"
        className={`${wrapperClass} opacity-60`}
        onMouseEnter={onHover}
      >
        <div className="flex items-center gap-3">
          <RowBody row={row} query={query} />
        </div>
      </div>
    );
  }

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      className={wrapperClass}
      onMouseEnter={onHover}
    >
      <Link
        to="/game/$gameId"
        params={{ gameId }}
        onClick={onSelect}
        className={`flex items-center gap-3 rounded-sm ${FOCUS_RING}`}
      >
        <RowBody row={row} query={query} />
      </Link>
    </div>
  );
}

function SearchResultsList({
  groups,
  query,
  activeIndex,
  isFetching,
  listboxId,
  resultCount,
  onHover,
  onSelect,
}: {
  groups: Group[];
  query: string;
  activeIndex: number;
  isFetching: boolean;
  listboxId: string;
  resultCount: number;
  onHover: (index: number) => void;
  onSelect: () => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        {isFetching ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-stone-400" aria-hidden="true" />
        ) : (
          <>
            <p className="text-sm font-semibold text-brand-ink">No results for “{query}”</p>
            <p className="mt-1 text-xs text-stone-500">Try a team, player, or matchup.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {isFetching ? 'Searching' : `${resultCount} results for ${query}`}
      </p>
      <div
        id={listboxId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[min(70vh,520px)] overflow-y-auto py-1"
      >
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <p className="px-4 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
              {group.label}
            </p>
            {group.rows.map(({ row, index }) => (
              <ResultRow
                key={row.key}
                row={row}
                query={query}
                index={index}
                active={index === activeIndex}
                listboxId={listboxId}
                onHover={() => onHover(index)}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
        <div className="mt-1 flex gap-3 border-t border-brand-line px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </>
  );
}

function useRowKeyboard({
  rows,
  activeIndex,
  setActiveIndex,
  onOpen,
}: {
  rows: Row[];
  activeIndex: number;
  setActiveIndex: (updater: (index: number) => number) => void;
  onOpen: (gameId: string) => void;
}) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (rows.length === 0) return;
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + delta + rows.length) % rows.length);
      } else if (event.key === 'Home' || event.key === 'End') {
        if (rows.length === 0) return;
        event.preventDefault();
        setActiveIndex(() => (event.key === 'Home' ? 0 : rows.length - 1));
      } else if (event.key === 'Enter') {
        const row = rows[activeIndex];
        const gameId = row ? rowGameId(row) : null;
        if (!gameId) return;
        event.preventDefault();
        onOpen(gameId);
      }
    },
    [rows, activeIndex, setActiveIndex, onOpen],
  );
}

/** Desktop (lg+): inline field in the middle of the bar with a results panel. */
export function GlobalSearchField({ onActivate }: { onActivate?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const {
    query,
    setQuery,
    debounced,
    isFetching,
    rows,
    groups,
    activeIndex,
    setActiveIndex,
    reset,
  } = useGlobalSearch();
  const listboxId = useId().replace(/:/g, '');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const showPanel = open && debounced.length >= MIN_QUERY_LENGTH;
  const activeOptionId =
    showPanel && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const openSearch = useCallback(() => {
    onActivate?.();
    setOpen(true);
    inputRef.current?.focus();
  }, [onActivate]);

  useSearchShortcut(true, openSearch);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleOpen = useCallback(
    (gameId: string) => {
      close();
      navigate({ to: '/game/$gameId', params: { gameId } });
    },
    [close, navigate],
  );

  const onKeyDown = useRowKeyboard({ rows, activeIndex, setActiveIndex, onOpen: handleOpen });

  return (
    <div ref={rootRef} className="relative w-full max-w-[420px]">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label="Search"
          autoComplete="off"
          placeholder="Search teams, players, games…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={openSearch}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (open) close();
              else inputRef.current?.blur();
              return;
            }
            onKeyDown(event);
          }}
          className="h-9 w-full rounded-lg border border-brand-line bg-white pl-9 pr-16 text-sm text-brand-ink placeholder:text-stone-400 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
        />
        <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-hidden="true" />
          ) : query.length === 0 ? (
            <kbd className="rounded border border-brand-line px-1.5 py-0.5 text-[11px] font-semibold text-stone-500">
              /
            </kbd>
          ) : null}
        </span>
      </div>

      {showPanel && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-[560px] max-w-[calc(100vw-3rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg">
          <SearchResultsList
            groups={groups}
            query={debounced}
            activeIndex={activeIndex}
            isFetching={isFetching}
            listboxId={listboxId}
            resultCount={rows.length}
            onHover={setActiveIndex}
            onSelect={close}
          />
        </div>
      )}
    </div>
  );
}

/** Below lg: icon trigger that opens a full-screen search sheet. */
export function GlobalSearchTrigger({ onActivate }: { onActivate?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const {
    query,
    setQuery,
    debounced,
    isFetching,
    rows,
    groups,
    activeIndex,
    setActiveIndex,
    reset,
  } = useGlobalSearch();
  const listboxId = useId().replace(/:/g, '');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const showResults = debounced.length >= MIN_QUERY_LENGTH;

  const close = useCallback(() => {
    setOpen(false);
    reset();
    triggerRef.current?.focus();
  }, [reset]);

  const openSearch = useCallback(() => {
    onActivate?.();
    setOpen(true);
  }, [onActivate]);

  useSearchShortcut(false, openSearch);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const handleOpen = useCallback(
    (gameId: string) => {
      setOpen(false);
      reset();
      navigate({ to: '/game/$gameId', params: { gameId } });
    },
    [reset, navigate],
  );

  const onKeyDown = useRowKeyboard({ rows, activeIndex, setActiveIndex, onOpen: handleOpen });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search"
        aria-expanded={open}
        onClick={openSearch}
        className={`flex h-9 w-9 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink lg:hidden ${FOCUS_RING}`}
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden"
          >
            <div className="flex items-center gap-2 border-b border-brand-line px-3 py-3">
              <button
                type="button"
                aria-label="Close search"
                onClick={close}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-ink ${FOCUS_RING}`}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={showResults}
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    showResults && activeIndex >= 0
                      ? `${listboxId}-option-${activeIndex}`
                      : undefined
                  }
                  aria-label="Search"
                  autoComplete="off"
                  placeholder="Search teams, players, games…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  className="h-9 w-full rounded-lg border border-brand-line bg-white pl-9 pr-3 text-sm text-brand-ink placeholder:text-stone-400 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {showResults ? (
                <SearchResultsList
                  groups={groups}
                  query={debounced}
                  activeIndex={activeIndex}
                  isFetching={isFetching}
                  listboxId={listboxId}
                  resultCount={rows.length}
                  onHover={setActiveIndex}
                  onSelect={() => setOpen(false)}
                />
              ) : (
                <p className="px-4 py-6 text-center text-sm text-stone-500">
                  Search teams, players, and games.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
