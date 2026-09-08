import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Game, TeamWithLeaders } from '../../lib/api';

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

function canonicalAbbr(tricode: string | null | undefined, fallback: string): string {
  if (tricode) return ABBR_MAP[tricode] ?? tricode;
  return fallback.slice(0, 3).toUpperCase();
}

function formatPreviousDateLabel(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const label = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const gameUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const diffDays = Math.round((todayUTC.getTime() - gameUTC.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return `${label} • Yesterday`;
    if (diffDays > 1 && diffDays <= 7) return `${label} • ${diffDays} days ago`;
    if (diffDays > 7) return `${label} • ${diffDays} days ago`;
    return label;
  } catch {
    return dateStr;
  }
}

function useItemsPerPage(): number {
  const get = () => {
    if (typeof window === 'undefined') return 3;
    const w = window.innerWidth;
    if (w >= 1024) return 3;
    if (w >= 640) return 2;
    return 1;
  };
  const [ipp, setIpp] = useState(get);
  useEffect(() => {
    const onResize = () => setIpp(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return ipp;
}

/** Build sliding windows with no empty gap on last page.
 *  e.g. 7 games, ipp=3 => [0-2],[3-5],[4-6] (last window snapped to end, overlapping)
 *       9 games, ipp=3 => [0-2],[3-5],[6-8] (no overlap needed)
 */
function buildPages<T>(arr: T[], ipp: number): T[][] {
  if (arr.length <= ipp) return arr.length ? [arr] : [];
  const pages: T[][] = [];
  let start = 0;
  while (start < arr.length) {
    if (start + ipp > arr.length) {
      const snapStart = Math.max(0, arr.length - ipp);
      // avoid duplicate of previous window when snapStart already covered
      const last = pages[pages.length - 1];
      const snapSlice = arr.slice(snapStart, snapStart + ipp);
      if (last && last.length === snapSlice.length && last[0] === snapSlice[0]) break;
      pages.push(snapSlice);
      break;
    }
    pages.push(arr.slice(start, start + ipp));
    start += ipp;
  }
  return pages;
}

export function PreviousGameDayCard({
  games,
  teams,
  loading,
}: {
  games: Game[] | undefined;
  teams?: TeamWithLeaders[] | null;
  loading?: boolean;
}) {
  const byAbbr = useMemo(() => {
    const m = new Map<string, TeamWithLeaders>();
    for (const t of teams ?? []) m.set(t.abbreviation, t);
    const byFull = new Map<string, TeamWithLeaders>();
    for (const t of teams ?? []) {
      byFull.set(t.fullName, t);
      byFull.set(t.teamName, t);
    }
    return { byAbbr: m, byFull };
  }, [teams]);

  const itemsPerPage = useItemsPerPage();
  const [page, setPage] = useState(0);

  const pages = useMemo(() => buildPages(games ?? [], itemsPerPage), [games, itemsPerPage]);
  const totalPages = pages.length;

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const gameDateKey = games?.[0]?.gameDate ?? '';
  useEffect(() => {
    setPage(0);
  }, [gameDateKey]);

  const go = useCallback(
    (next: number) => {
      if (totalPages <= 1) return;
      const n = ((next % totalPages) + totalPages) % totalPages;
      setPage(n);
    },
    [totalPages],
  );

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
          <div className="h-6 w-64 animate-pulse rounded bg-white/20" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[180px] animate-pulse rounded-xl border border-stone-200 bg-stone-50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
          <h2 className="font-heading text-xl font-black uppercase tracking-wide text-white">
            Previous Game Day
          </h2>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            No results
          </span>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-stone-500">No previous game results available.</p>
          <p className="mt-1 text-xs text-stone-400">
            Results will appear after the first games of the season.
          </p>
        </div>
      </div>
    );
  }

  const prevDate = games[0]?.gameDate ?? '';
  const label = prevDate ? formatPreviousDateLabel(prevDate) : 'Previous Game Day';
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const showSlider = games.length > itemsPerPage;

  const renderGameCard = (g: Game) => {
    const awayAbbr = g.awayTricode
      ? (ABBR_MAP[g.awayTricode] ?? g.awayTricode)
      : canonicalAbbr(null, g.awayTeam);
    const homeAbbr = g.homeTricode
      ? (ABBR_MAP[g.homeTricode] ?? g.homeTricode)
      : canonicalAbbr(null, g.homeTeam);
    const awayTeam = byAbbr.byAbbr.get(awayAbbr) ?? byAbbr.byFull.get(g.awayTeam) ?? null;
    const homeTeam = byAbbr.byAbbr.get(homeAbbr) ?? byAbbr.byFull.get(g.homeTeam) ?? null;

    const awayScore = g.awayScore ?? 0;
    const homeScore = g.homeScore ?? 0;
    const awayColor = awayTeam?.primaryColor ?? '#2B2B2B';
    const homeColor = homeTeam?.primaryColor ?? '#1C4188';
    // popup uses left=away, right=home
    const leftColor = awayColor;
    const rightColor = homeColor;
    const statusLower = (g.status ?? '').toLowerCase();
    const isFinal = statusLower.includes('final') || (g.gameDate ?? '') < todayStr;
    const statusLabel = isFinal ? 'Final' : g.status || 'Scheduled';
    // for previous day all are Final
    const awayLogo = awayTeam?.logoUrl ?? '';
    const homeLogo = homeTeam?.logoUrl ?? '';
    const awayFull = awayTeam?.teamName ?? g.awayTeam;
    const homeFull = homeTeam?.teamName ?? g.homeTeam;

    // time label
    let timeET = '';
    try {
      const d = new Date(g.gameDateTime);
      if (!Number.isNaN(d.getTime()))
        timeET =
          d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
          }) + ' ET';
    } catch {}

    return (
      <div
        key={g.id}
        className="flex flex-col overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm transition hover:shadow-md"
      >
        {/* hero — same design as GameDetailsPopup (MonthlyCalendar click) */}
        <div className="relative flex h-[170px] shrink-0 overflow-hidden">
          {/* diagonal territories */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: leftColor,
                clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: rightColor,
                clipPath: 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0.14) 0%, rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.18) 100%)',
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.10]"
              style={{
                background:
                  'radial-gradient(ellipse 80% 60% at 22% 18%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(ellipse 72% 52% at 86% 84%, rgba(0,0,0,0.18), transparent 60%)',
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.20]"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(255,255,255,0.96) 1.05px, transparent 1.35px)',
                backgroundSize: '11px 11px',
                clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)',
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.20]"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(255,255,255,0.96) 1.05px, transparent 1.35px)',
                backgroundSize: '11px 11px',
                clipPath: 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)',
              }}
            />
            <div className="absolute left-[-6%] top-[18%] h-[10px] w-[28%] -skew-x-[12deg] bg-white/10 ring-1 ring-white/10" />
            <div className="absolute right-[-4%] bottom-[16%] h-[10px] w-[26%] -skew-x-[12deg] bg-black/10 ring-1 ring-black/5" />
            <div className="absolute inset-x-0 top-0 h-px bg-black/25" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-black/20" />
          </div>

          {/* status pill top-center — same as popup */}
          <span className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white shadow-sm ring-1 ring-black/10">
            {statusLabel} • {awayAbbr} @ {homeAbbr}
          </span>

          {/* split content — vertical: LOGO / name / away-home (same as hero banner) */}
          <div className="relative z-10 flex flex-1 items-stretch">
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 pb-4 pt-8">
              {awayLogo ? (
                <img
                  src={awayLogo}
                  alt={awayTeam?.fullName ?? awayAbbr}
                  className="h-[56px] w-[56px] object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
                  loading="lazy"
                />
              ) : (
                <span
                  className="font-heading text-2xl font-black tracking-tighter text-white"
                  style={
                    {
                      WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                      textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                    } as React.CSSProperties
                  }
                >
                  {awayAbbr}
                </span>
              )}
              <span
                className="max-w-[12ch] text-center font-heading text-sm font-black leading-tight tracking-wide text-white"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                {awayFull}
              </span>
              <span
                className="text-xs font-bold uppercase tracking-[0.2em] text-white/80"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                Away
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 pb-4 pt-8">
              {homeLogo ? (
                <img
                  src={homeLogo}
                  alt={homeTeam?.fullName ?? homeAbbr}
                  className="h-[56px] w-[56px] object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
                  loading="lazy"
                />
              ) : (
                <span
                  className="font-heading text-2xl font-black tracking-tighter text-white"
                  style={
                    {
                      WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                      textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                    } as React.CSSProperties
                  }
                >
                  {homeAbbr}
                </span>
              )}
              <span
                className="max-w-[12ch] text-center font-heading text-sm font-black leading-tight tracking-wide text-white"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                {homeFull}
              </span>
              <span
                className="text-xs font-bold uppercase tracking-[0.2em] text-white/80"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                Home
              </span>
            </div>
          </div>

          {/* VS + score — centered on diagonal */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
            <span
              className="font-heading text-[32px] font-black italic leading-none tracking-[0.06em] text-white"
              style={
                {
                  WebkitTextStroke: '1.5px rgba(0,0,0,0.55)',
                  paintOrder: 'stroke fill',
                  textShadow: '0 3px 12px rgba(0,0,0,0.45)',
                } as React.CSSProperties
              }
            >
              VS
            </span>
            {isFinal && (
              <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white ring-1 ring-white/20 backdrop-blur">
                {awayScore} - {homeScore}
              </span>
            )}
          </div>
        </div>

        {/* footer details — same tone as popup details */}
        <div className="flex items-center justify-between border-t border-brand-line bg-white px-3 py-2">
          <span className="text-[11px] font-semibold text-stone-600">
            {g.gameDate} • {timeET}
          </span>
          <span className="truncate text-[11px] text-stone-500 ml-2">
            {g.arenaName ?? `${awayAbbr} @ ${homeAbbr}`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
        <h2 className="font-heading text-xl font-black uppercase tracking-wide text-white">
          Previous Game Day — {label}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            {games.length} {games.length === 1 ? 'Game' : 'Games'} • Final
          </span>
          {showSlider && (
            <>
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => go(page - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next page"
                onClick={() => go(page + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>

      {showSlider ? (
        <div className="relative bg-stone-100">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `translateX(-${page * 100}%)` }}
            >
              {pages.map((pageGames, pi) => (
                <div
                  key={pi}
                  className="flex w-full shrink-0 gap-3 p-3"
                  style={{ minWidth: '100%' }}
                >
                  <div
                    className={`grid w-full gap-3 ${itemsPerPage === 3 ? 'grid-cols-3' : itemsPerPage === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
                  >
                    {pageGames.map((g) => renderGameCard(g))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-stone-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold text-stone-500">
              {page + 1} / {totalPages}
            </span>
            <div className="flex gap-1.5">
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to page ${i + 1}`}
                  onClick={() => go(i)}
                  className={`h-1.5 rounded-full transition-all ${i === page ? 'w-6 bg-brand-navy' : 'w-1.5 bg-stone-300'}`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 bg-stone-100 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => renderGameCard(g))}
        </div>
      )}
    </div>
  );
}
