import { useMemo, useState } from 'react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { canonicalAbbr, getGameStatus } from '../../lib/game-utils';

function abbrFromFallback(tricode: string | null | undefined, fallback: string): string {
  if (tricode) return canonicalAbbr(tricode);
  // fallback may be a full name e.g. "Golden State Warriors"
  return fallback.slice(0, 3).toUpperCase();
}

const MAX_VISIBLE_GAMES = 3;

export function SevenDayStrip({
  games,
  teams,
  heroDateKey,
  loading,
  onGameClick,
}: {
  games: Game[] | undefined;
  teams?: TeamWithLeaders[] | null;
  heroDateKey: string | null;
  loading?: boolean;
  onGameClick?: (game: Game) => void;
}) {
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);

  const byAbbr = useMemo(() => {
    const m = new Map<string, TeamWithLeaders>();
    for (const t of teams ?? []) m.set(t.abbreviation, t);
    // also allow lookup by fullName
    const byFull = new Map<string, TeamWithLeaders>();
    for (const t of teams ?? []) {
      byFull.set(t.fullName, t);
      byFull.set(t.teamName, t);
    }
    return { byAbbr: m, byFull };
  }, [teams]);

  const days = useMemo(() => {
    const now = new Date();
    const arr: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      date.setDate(now.getDate() + d);
      arr.push(date);
    }
    return arr;
  }, []);

  const gamesByDate = useMemo(() => {
    const m = new Map<string, Game[]>();
    for (const g of games ?? []) {
      const key =
        g.gameDate ?? (g.gameDateTime ? new Date(g.gameDateTime).toISOString().slice(0, 10) : '');
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(g);
    }
    // sort each day by time
    for (const [, arr] of m) {
      arr.sort((a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime());
    }
    return m;
  }, [games]);

  const renderGame = (g: Game, compact: boolean) => {
    const awayAbbr = abbrFromFallback(g.awayTricode, g.awayTeam);
    const homeAbbr = abbrFromFallback(g.homeTricode, g.homeTeam);

    // resolve logos via teams map
    const awayTeam = byAbbr.byAbbr.get(awayAbbr) ?? byAbbr.byFull.get(g.awayTeam) ?? null;
    const homeTeam = byAbbr.byAbbr.get(homeAbbr) ?? byAbbr.byFull.get(g.homeTeam) ?? null;

    const status = getGameStatus(g);
    const isFinal = status === 'final';
    const isLive = status === 'live';

    let timeOrScore = '';
    if (isFinal) timeOrScore = `F ${g.awayScore ?? 0}-${g.homeScore ?? 0}`;
    else if (isLive) timeOrScore = `● ${g.awayScore ?? 0}-${g.homeScore ?? 0}`;
    else {
      try {
        const d = new Date(g.gameDateTime);
        timeOrScore = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' ET';
      } catch {
        timeOrScore = g.status ?? '';
      }
    }

    return (
      <button
        key={g.id}
        type="button"
        onClick={() => onGameClick?.(g)}
        className={`flex w-full rounded border px-1.5 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
          compact ? 'flex-col gap-1 py-1' : 'items-center gap-1.5 py-1.5'
        } ${
          isLive
            ? 'border-red-200 bg-red-50'
            : isFinal
              ? 'border-stone-200 bg-stone-100 opacity-70'
              : 'border-court-200 bg-court-50 hover:bg-court-100'
        }`}
      >
        <div
          className={`flex items-center gap-1 whitespace-nowrap ${
            compact ? '' : 'min-w-0 flex-1 overflow-hidden'
          }`}
        >
          {awayTeam?.logoUrl ? (
            <img
              src={awayTeam.logoUrl}
              alt={awayAbbr}
              className="h-4 w-4 shrink-0 object-contain"
            />
          ) : null}
          <span className={`text-[11px] font-bold ${compact ? '' : 'truncate'}`}>{awayAbbr}</span>
          <span className="text-[10px] text-stone-400">@</span>
          {homeTeam?.logoUrl ? (
            <img
              src={homeTeam.logoUrl}
              alt={homeAbbr}
              className="h-4 w-4 shrink-0 object-contain"
            />
          ) : null}
          <span className={`text-[11px] font-bold ${compact ? '' : 'truncate'}`}>{homeAbbr}</span>
        </div>
        <div
          className={`shrink-0 text-[10px] font-semibold ${
            isLive ? 'text-brand-red' : isFinal ? 'text-stone-500' : 'text-brand-navy'
          }`}
        >
          {timeOrScore}
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-court-100 p-3">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <div className="h-5 w-48 animate-pulse rounded bg-court-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-court-200/60" />
        </div>
        <div className="grid grid-cols-7 gap-2 max-sm:flex max-sm:overflow-x-auto">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[200px] rounded-lg border border-court-200 bg-white p-2 shadow-sm max-sm:min-w-[160px]"
            >
              <div className="h-12 animate-pulse rounded bg-court-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-court-100 p-3">
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <h3 className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
          Next 7 Days{' '}
          <span className="font-sans text-sm font-semibold normal-case tracking-normal text-stone-500">
            H+0 → H+6 • All games
          </span>
        </h3>
        <span className="hidden text-xs text-stone-500 sm:inline">today highlighted</span>
      </div>

      {/* desktop: 7 cols. mobile: horizontal scroll */}
      <div className="grid grid-cols-7 items-stretch gap-2 max-sm:flex max-sm:overflow-x-auto max-sm:scrollbar-none max-sm:snap-x max-sm:snap-mandatory">
        {days.map((date, dayIndex) => {
          const key = date.toISOString().slice(0, 10);
          const dayGames = gamesByDate.get(key) ?? [];
          const isToday = key === new Date().toISOString().slice(0, 10);
          const isHero = key === heroDateKey;
          const hiddenCount = Math.max(0, dayGames.length - MAX_VISIBLE_GAMES);
          const popoverOpen = openDayKey === key;

          return (
            <div
              key={key}
              className={`relative flex min-h-[200px] flex-col rounded-lg border bg-white shadow-sm transition max-sm:min-w-[160px] max-sm:snap-start ${
                isToday
                  ? 'border-court-200 border-t-[3px] border-t-brand-gold'
                  : isHero
                    ? 'border-[1.5px] border-brand-navy'
                    : 'border-court-200'
              }`}
            >
              <div
                className={`rounded-t-[7px] border-b px-2 py-2 text-center ${
                  isToday
                    ? 'border-basketball-100 bg-basketball-50'
                    : isHero
                      ? 'border-arena-100 bg-arena-50'
                      : 'border-court-200 bg-court-50'
                }`}
              >
                <div
                  className={`text-[11px] font-bold uppercase tracking-widest ${
                    isToday ? 'text-basketball-600' : isHero ? 'text-arena-700' : 'text-stone-500'
                  }`}
                >
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  {isToday ? ' •' : ''}
                </div>
                <div
                  className={`font-heading text-xl font-black leading-none ${
                    isToday ? 'text-brand-ink' : isHero ? 'text-brand-navy' : 'text-stone-700'
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="text-[10px] text-stone-400">
                  {dayGames.length
                    ? `${dayGames.length} ${dayGames.length === 1 ? 'game' : 'games'}`
                    : 'No games'}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                {dayGames.length ? (
                  <>
                    {dayGames.slice(0, MAX_VISIBLE_GAMES).map((g) => renderGame(g, true))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenDayKey(popoverOpen ? null : key)}
                        className={`mx-auto mt-auto rounded-md px-2.5 py-1 text-[11px] font-bold underline decoration-brand-gold decoration-2 underline-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                          popoverOpen
                            ? 'bg-brand-navy text-white'
                            : 'text-brand-navy hover:bg-arena-50'
                        }`}
                      >
                        View all {dayGames.length}
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              {/* full-day popover */}
              {popoverOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close day games popover"
                    onClick={() => setOpenDayKey(null)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div
                    className={`absolute top-full z-20 mt-2 w-64 rounded-lg border border-court-200 bg-white shadow-lg ${
                      dayIndex < 2
                        ? 'left-0'
                        : dayIndex > 4
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-court-200 px-3 py-2">
                      <span className="font-heading text-sm font-bold uppercase tracking-wide text-brand-ink">
                        {date.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-stone-400">
                          {dayGames.length} {dayGames.length === 1 ? 'game' : 'games'}
                        </span>
                        <button
                          type="button"
                          aria-label="Close"
                          onClick={() => setOpenDayKey(null)}
                          className="flex h-5 w-5 items-center justify-center rounded text-stone-400 transition hover:bg-court-100 hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto p-2">
                      {dayGames.map((g) => renderGame(g, false))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
