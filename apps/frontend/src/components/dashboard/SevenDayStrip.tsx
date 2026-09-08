import { useMemo } from 'react';
import type { Game, TeamWithLeaders } from '../../lib/api';

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

function canonicalAbbr(tricode: string | null | undefined, fallback: string): string {
  if (tricode) return ABBR_MAP[tricode] ?? tricode;
  // fallback may be full name e.g. "Golden State Warriors" - map via teams lookup elsewhere
  return fallback.slice(0, 3).toUpperCase();
}

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

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-brand-line bg-white px-5 py-3">
          <div className="h-5 w-48 animate-pulse rounded bg-stone-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-stone-100" />
        </div>
        <div className="grid grid-cols-7 gap-px divide-x divide-brand-line bg-brand-line">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-h-[180px] bg-white p-2">
              <div className="h-12 animate-pulse rounded bg-stone-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-line bg-white px-5 py-3">
        <h3 className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
          Next 7 Days{' '}
          <span className="font-sans text-sm font-semibold normal-case tracking-normal text-stone-400">
            H+0 → H+6 • All games
          </span>
        </h3>
        <span className="hidden text-xs text-stone-500 sm:inline">today highlighted</span>
      </div>

      {/* desktop: 7 cols. mobile: horizontal scroll */}
      <div className="grid grid-cols-7 divide-x divide-brand-line gap-px bg-brand-line sm:grid sm:grid-cols-7 max-sm:flex max-sm:overflow-x-auto max-sm:scrollbar-none max-sm:snap-x max-sm:snap-mandatory">
        {days.map((date) => {
          const key = date.toISOString().slice(0, 10);
          const dayGames = gamesByDate.get(key) ?? [];
          const isToday = key === new Date().toISOString().slice(0, 10);
          const isHero = key === heroDateKey;

          return (
            <div
              key={key}
              className={`flex min-h-[180px] flex-col max-sm:min-w-[160px] max-sm:snap-start ${
                isToday ? 'bg-amber-50' : isHero ? 'bg-blue-50/60' : 'bg-white'
              }`}
            >
              <div
                className={`border-b px-2 py-2 text-center ${
                  isToday
                    ? 'border-amber-200 bg-amber-100'
                    : isHero
                      ? 'border-blue-200 bg-blue-100'
                      : 'border-brand-line bg-stone-50'
                }`}
              >
                <div
                  className={`text-[11px] font-bold uppercase tracking-widest ${
                    isToday ? 'text-amber-700' : isHero ? 'text-blue-700' : 'text-stone-500'
                  }`}
                >
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`font-heading text-xl font-black leading-none ${
                    isToday ? 'text-amber-700' : isHero ? 'text-blue-700' : 'text-stone-700'
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
                  dayGames.map((g) => {
                    const awayAbbr = g.awayTricode
                      ? (ABBR_MAP[g.awayTricode] ?? g.awayTricode)
                      : canonicalAbbr(null, g.awayTeam);
                    const homeAbbr = g.homeTricode
                      ? (ABBR_MAP[g.homeTricode] ?? g.homeTricode)
                      : canonicalAbbr(null, g.homeTeam);

                    // resolve logos via teams map
                    const awayTeam =
                      byAbbr.byAbbr.get(awayAbbr) ?? byAbbr.byFull.get(g.awayTeam) ?? null;
                    const homeTeam =
                      byAbbr.byAbbr.get(homeAbbr) ?? byAbbr.byFull.get(g.homeTeam) ?? null;

                    const s = (g.status ?? '').toLowerCase();
                    const isFinal = s.includes('final');
                    const isLive =
                      s.includes('live') || s.includes('in progress') || s.includes('halftime');

                    let timeOrScore = '';
                    if (isFinal) timeOrScore = `F ${g.awayScore ?? 0}-${g.homeScore ?? 0}`;
                    else if (isLive) timeOrScore = `● ${g.awayScore ?? 0}-${g.homeScore ?? 0}`;
                    else {
                      try {
                        const d = new Date(g.gameDateTime);
                        timeOrScore =
                          d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
                          ' ET';
                      } catch {
                        timeOrScore = g.status ?? '';
                      }
                    }

                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onGameClick?.(g)}
                        className={`flex flex-col gap-1 rounded border px-1.5 py-1 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                          isLive
                            ? 'border-red-200 bg-red-50'
                            : isFinal
                              ? 'border-stone-200 bg-stone-50 opacity-70'
                              : 'border-brand-line bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {awayTeam?.logoUrl ? (
                            <img
                              src={awayTeam.logoUrl}
                              alt={awayAbbr}
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="text-[11px] font-bold">{awayAbbr}</span>
                          <span className="text-[10px] text-stone-400">@</span>
                          {homeTeam?.logoUrl ? (
                            <img
                              src={homeTeam.logoUrl}
                              alt={homeAbbr}
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="text-[11px] font-bold">{homeAbbr}</span>
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            isLive
                              ? 'text-brand-red'
                              : isFinal
                                ? 'text-stone-500'
                                : 'text-brand-navy'
                          }`}
                        >
                          {timeOrScore}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-[11px] italic text-stone-300">
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
