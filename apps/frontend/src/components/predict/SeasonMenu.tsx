import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import type { GameSeason } from '../../lib/api';
import { seasonLabel, weekStartKey, weekStartOf } from './week';

const spanFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `Oct 3 – Apr 11`, the window a season's games span. */
function seasonSpan(firstGameDate: string, lastGameDate: string): string {
  const first = new Date(`${firstGameDate}T12:00:00.000Z`);
  const last = new Date(`${lastGameDate}T12:00:00.000Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return '';
  return `${spanFormatter.format(first)} – ${spanFormatter.format(last)}`;
}

/**
 * Pick a season, then land on a week inside it.
 *
 * The arrows skip empty weeks, but reaching a past season still means crossing
 * the off-season one click at a time. This jumps straight there: the current
 * season opens on this week, and a finished season opens on its last week of
 * games.
 */
export function SeasonMenu({
  seasons,
  activeWeekStart,
  onSelectWeek,
}: {
  /** Newest first, from `GET /games/seasons`. */
  seasons: GameSeason[];
  /** The week the rail is showing, used to mark the season it belongs to. */
  activeWeekStart: string;
  onSelectWeek: (weekStart: string) => void;
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

  const currentSeason = seasonLabel(weekStartKey(0));
  const activeSeason = activeWeekStart ? seasonLabel(activeWeekStart) : currentSeason;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="season-menu"
        aria-label={`Season: ${activeSeason}`}
        className="flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-2 text-[11px] font-black uppercase tracking-widest text-brand-navy transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="tabular-nums">{activeSeason}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="season-menu"
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
        >
          <p className="border-b border-brand-line bg-stone-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500">
            Jump to season
          </p>
          {seasons.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-500">No seasons yet.</p>
          ) : (
            seasons.map((entry) => {
              const active = entry.season === activeSeason;
              const isCurrent = entry.season === currentSeason;
              // The current season opens on today; a finished one opens where
              // its games stop.
              const target = isCurrent ? weekStartKey(0) : weekStartOf(entry.lastGameDate);
              const span = seasonSpan(entry.firstGameDate, entry.lastGameDate);
              return (
                <button
                  key={entry.season}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={!target}
                  onClick={() => {
                    setOpen(false);
                    if (target) onSelectWeek(target);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:opacity-50 ${
                    active ? 'bg-brand-navy/5' : 'hover:bg-stone-50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-brand-ink">
                        {entry.season}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-brand-navy/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-brand-navy">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      {span ? `${span} · ` : ''}
                      {entry.games} {entry.games === 1 ? 'game' : 'games'}
                    </span>
                  </span>

                  {active && (
                    <Check className="h-4 w-4 shrink-0 text-brand-navy" aria-hidden="true" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
