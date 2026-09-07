import { useMemo, useState, useEffect, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { useTopPlayers } from '../../lib/api';

const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

function canonicalAbbr(tricode: string | null | undefined): string {
  if (!tricode) return '';
  return ABBR_MAP[tricode] ?? tricode;
}

function getTeamByTricode(
  tricode: string | null | undefined,
  byAbbr: Map<string, TeamWithLeaders>,
): TeamWithLeaders | null {
  const abbr = canonicalAbbr(tricode);
  return byAbbr.get(abbr) ?? null;
}

function getGameStatus(g: Game): 'final' | 'live' | 'scheduled' {
  const s = (g.status ?? '').toLowerCase();
  if (s.includes('final')) return 'final';
  if (
    s.includes('live') ||
    s.includes('in progress') ||
    s.includes('halftime') ||
    s.includes('q1') ||
    s.includes('q2') ||
    s.includes('q3') ||
    s.includes('q4') ||
    s.includes('ot')
  ) {
    return 'live';
  }
  if (s.includes('scheduled') || s === '') return 'scheduled';
  if (/q[1-4]|ot|half/i.test(s)) return 'live';
  return 'scheduled';
}

function formatHeroDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeET(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch {
    return '';
  }
}

function getSeasonBadge(g: Game): {
  label: string;
  detail?: string;
  variant: 'preseason' | 'playoffs' | 'allstar' | 'regular';
} | null {
  const label = (g.gameLabel ?? '').trim();
  const series = (g.seriesText ?? '').trim();
  const sub = (g.gameSubLabel ?? '').trim();
  if (label === 'Preseason') return { label: 'Preseason', variant: 'preseason' };
  if (label === 'All-Star' || label === 'All-Star Championship')
    return { label: 'All-Star', variant: 'allstar' };
  if (series) return { label: 'Playoffs', detail: series || sub, variant: 'playoffs' };
  if (label) {
    if (label.toLowerCase().includes('playoff'))
      return { label, detail: series || sub, variant: 'playoffs' };
    return { label, variant: 'regular' };
  }
  // empty label = Regular Season
  return { label: 'Regular Season', variant: 'regular' };
}

function getHeroSeasonSummary(
  games: Game[],
): { label: string; variant: 'preseason' | 'playoffs' | 'allstar' | 'regular' | 'mixed' } | null {
  if (games.length === 0) return null;
  const badges = games.map(getSeasonBadge).filter(Boolean) as NonNullable<
    ReturnType<typeof getSeasonBadge>
  >[];
  if (badges.length === 0) return null;
  const first = badges[0].label;
  const same = badges.every((b) => b.label === first && b.variant === badges[0].variant);
  if (same) return { label: first, variant: badges[0].variant };
  return { label: 'Mixed', variant: 'mixed' as const };
}

function showToast(message: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = message;
  el.className =
    'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-navyDark px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 ' +
    'transition-all duration-300';
  el.style.opacity = '0';
  el.style.transform = 'translate(-50%, 8px)';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, 0)';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 8px)';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

export function computeHero(
  games: Game[],
  now: Date,
  maxDays = 7,
): { dateKey: string; date: Date; games: Game[] } | null {
  const byDate = new Map<string, Game[]>();
  for (const g of games) {
    const key =
      g.gameDate ?? (g.gameDateTime ? new Date(g.gameDateTime).toISOString().slice(0, 10) : '');
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(g);
  }
  for (let d = 0; d < maxDays; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const key = date.toISOString().slice(0, 10);
    const dayGames = byDate.get(key) ?? [];
    if (dayGames.length === 0) continue;
    const hasLiveOrSched = dayGames.some((g) => {
      const st = getGameStatus(g);
      return st === 'live' || st === 'scheduled';
    });
    if (hasLiveOrSched) {
      return { dateKey: key, date, games: dayGames };
    }
  }
  const sortedKeys = Array.from(byDate.keys()).sort();
  const nowKey = now.toISOString().slice(0, 10);
  for (const key of sortedKeys) {
    if (key < nowKey) continue;
    const dayGames = byDate.get(key) ?? [];
    if (dayGames.length === 0) continue;
    const hasLiveOrSched = dayGames.some((g) => {
      const st = getGameStatus(g);
      return st === 'live' || st === 'scheduled';
    });
    if (hasLiveOrSched) {
      return { dateKey: key, date: new Date(`${key}T12:00:00.000Z`), games: dayGames };
    }
  }
  return null;
}

function HeroSlide({
  g,
  byAbbr,
  showTopPlayer,
}: {
  g: Game;
  byAbbr: Map<string, TeamWithLeaders>;
  showTopPlayer: boolean;
}) {
  const away = getTeamByTricode(g.awayTricode ?? g.awayTeam, byAbbr);
  const home = getTeamByTricode(g.homeTricode ?? g.homeTeam, byAbbr);
  const awayColor = away?.primaryColor ?? '#2B2B2B';
  const homeColor = home?.primaryColor ?? '#1C4188';
  const awayLogo = away?.logoUrl ?? '';
  const homeLogo = home?.logoUrl ?? '';
  const awayAbbr =
    canonicalAbbr(g.awayTricode) || away?.abbreviation || g.awayTeam.slice(0, 3).toUpperCase();
  const homeAbbr =
    canonicalAbbr(g.homeTricode) || home?.abbreviation || g.homeTeam.slice(0, 3).toUpperCase();
  const awayFullName = away?.fullName ?? g.awayTeam ?? awayAbbr;
  const homeFullName = home?.fullName ?? g.homeTeam ?? homeAbbr;

  const { data: awayPlayers, isLoading: awayLoading } = useTopPlayers(
    showTopPlayer ? awayAbbr : undefined,
  );
  const { data: homePlayers, isLoading: homeLoading } = useTopPlayers(
    showTopPlayer ? homeAbbr : undefined,
  );
  const awayTop = awayPlayers?.[0] ?? null;
  const homeTop = homePlayers?.[0] ?? null;

  const status = getGameStatus(g);
  const isFinal = status === 'final';
  const isLive = status === 'live';
  const timeLabel = formatTimeET(g.gameDateTime);
  const pillText = isFinal
    ? `Final ${g.awayScore ?? 0}-${g.homeScore ?? 0}`
    : isLive
      ? `● Live ${g.awayScore ?? 0}-${g.homeScore ?? 0}`
      : `${timeLabel} ET`;
  const pillClass = isFinal
    ? 'bg-stone-800 text-white'
    : isLive
      ? 'bg-brand-red text-white animate-pulse'
      : 'bg-white text-brand-navy';
  const muted = isFinal ? 'opacity-[0.85] saturate-[0.7]' : '';
  const seasonBadge = getSeasonBadge(g);

  const renderTeamOrPlayer = (
    side: 'away' | 'home',
    _team: TeamWithLeaders | null,
    fullName: string,
    abbr: string,
    logo: string,
    topPlayer: typeof awayTop,
    loading: boolean,
  ) => {
    if (!showTopPlayer) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
          {logo ? (
            <img
              src={logo}
              alt={fullName}
              className="h-24 w-24 object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)] sm:h-36 sm:w-36"
              loading="lazy"
            />
          ) : (
            <span
              className="font-heading text-3xl font-black tracking-tighter text-white"
              style={
                {
                  WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                  textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                } as React.CSSProperties
              }
            >
              {abbr}
            </span>
          )}
          <span
            className="font-heading text-center text-base font-black leading-tight tracking-wide text-white sm:text-2xl"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' } as React.CSSProperties}
          >
            {fullName}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
            {side === 'away' ? 'Away' : 'Home'}
          </span>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6">
          <div className="h-16 w-16 animate-pulse rounded-full bg-white/20 sm:h-20 sm:w-20" />
          <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
          <div className="flex gap-1">
            <div className="h-10 w-12 animate-pulse rounded bg-white/10" />
            <div className="h-10 w-12 animate-pulse rounded bg-white/10" />
            <div className="h-10 w-12 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      );
    }

    if (!topPlayer) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
          {logo ? (
            <img
              src={logo}
              alt={fullName}
              className="h-16 w-16 object-contain opacity-60 sm:h-20 sm:w-20"
              loading="lazy"
            />
          ) : null}
          <span className="text-xs italic text-white/60">No player data</span>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
        <img
          src={topPlayer.headshotUrl}
          alt={topPlayer.name}
          className="h-24 w-24 rounded-full border-[3px] border-white/90 object-cover shadow-xl sm:h-32 sm:w-32"
          loading="lazy"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        />
        <span
          className="font-heading text-center text-base font-black leading-tight tracking-wide text-white sm:text-xl"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' } as React.CSSProperties}
        >
          {topPlayer.name}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
          {topPlayer.position} • {fullName}
        </span>
        <div className="flex items-stretch overflow-hidden rounded-xl bg-white shadow-lg divide-x divide-stone-200">
          <div className="px-3.5 py-2 text-center">
            <div className="text-sm font-black leading-none text-brand-navy sm:text-base">
              {topPlayer.points.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
              PPG
            </div>
          </div>
          <div className="px-3.5 py-2 text-center">
            <div className="text-sm font-black leading-none text-brand-navy sm:text-base">
              {topPlayer.assists.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
              APG
            </div>
          </div>
          <div className="px-3.5 py-2 text-center">
            <div className="text-sm font-black leading-none text-brand-navy sm:text-base">
              {topPlayer.rebounds.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
              RPG
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`relative flex min-w-full shrink-0 flex-col sm:h-[400px] sm:flex-row ${muted}`}
      style={{ minHeight: showTopPlayer ? 400 : 280 }}
    >
      <div className="absolute inset-0 flex overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: awayColor,
            clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: homeColor,
            clipPath: 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.18) 100%)',
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
          className="absolute inset-0 opacity-[0.2]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.96) 1.05px, transparent 1.35px)',
            backgroundSize: '11px 11px',
            clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.2]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.96) 1.05px, transparent 1.35px)',
            backgroundSize: '11px 11px',
            clipPath: 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)',
          }}
        />
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" />
      </div>

      <div className="relative flex flex-1 items-stretch justify-between px-4 sm:px-6">
        {renderTeamOrPlayer('away', away, awayFullName, awayAbbr, awayLogo, awayTop, awayLoading)}

        {/* Center spine — VS is geometrically centered; logo groups are also centered; meta floats without pushing VS */}
        <div className="relative flex w-[168px] shrink-0 self-stretch px-2 sm:w-[220px] sm:px-4">
          {/* VS — absolute dead-center of the card */}
          <span
            className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 font-heading text-3xl font-black italic leading-none tracking-[0.06em] text-white sm:text-4xl"
            style={
              {
                WebkitTextStroke: '1.5px rgba(0,0,0,0.5)',
                textShadow: '0 4px 12px rgba(0,0,0,0.4)',
              } as React.CSSProperties
            }
          >
            VS
          </span>

          {/* Preseason pill — directly on top of VS (does not affect VS centering) */}
          {seasonBadge && (
            <span
              title={seasonBadge.detail ?? undefined}
              className={`absolute left-1/2 top-1/2 z-10 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] shadow ring-1 ${
                seasonBadge.variant === 'preseason'
                  ? 'bg-amber-400 text-stone-900 ring-amber-300'
                  : seasonBadge.variant === 'playoffs'
                    ? 'bg-brand-red text-white ring-white/20'
                    : seasonBadge.variant === 'allstar'
                      ? 'bg-brand-gold text-brand-navy ring-white/20'
                      : 'bg-white/20 text-white ring-white/30 backdrop-blur'
              }`}
              style={{ transform: 'translate(-50%, calc(-50% - 38px))' } as React.CSSProperties}
            >
              {seasonBadge.label}
              {seasonBadge.detail ? ` • ${seasonBadge.detail}` : ''}
            </span>
          )}

          {/* Bottom cluster — hugs bottom: time pill on top of arena pill, then Predict hugging bottom edge */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:bottom-4">
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow ${pillClass}`}
            >
              {pillText}
            </span>
            <span className="hidden max-w-[160px] items-center gap-1 whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-xs font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur sm:inline-flex sm:max-w-[200px]">
              <MapPin className="h-3 w-3 shrink-0 text-white/80" aria-hidden="true" />
              <span className="truncate">
                {g.arenaName ? g.arenaName : `${awayAbbr} @ ${homeAbbr}`}
              </span>
            </span>
            <span className="max-w-[140px] truncate text-center text-[11px] font-medium leading-tight text-white/75 sm:hidden">
              {g.arenaName ? g.arenaName : `${awayAbbr} @ ${homeAbbr}`}
            </span>
            {isFinal ? (
              <span className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70">
                View Recap
              </span>
            ) : isLive ? (
              <button
                type="button"
                onClick={() => showToast('Predictions coming soon')}
                className="rounded-full bg-brand-red px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow"
              >
                Watch Live
              </button>
            ) : (
              <button
                type="button"
                onClick={() => showToast('Predictions coming soon')}
                className="rounded-full bg-white px-6 py-2.5 text-xs font-black uppercase tracking-widest text-brand-navy shadow"
              >
                Predict →
              </button>
            )}
          </div>
        </div>

        {renderTeamOrPlayer('home', home, homeFullName, homeAbbr, homeLogo, homeTop, homeLoading)}
      </div>
    </div>
  );
}

export function LeagueWideHeroCarousel({
  games,
  nextGames,
  teams,
  loading,
}: {
  games: Game[] | undefined;
  nextGames?: Game[] | undefined;
  teams?: TeamWithLeaders[] | null;
  loading?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [showTopPlayer, setShowTopPlayer] = useState(false);

  const byAbbr = useMemo(() => {
    const m = new Map<string, TeamWithLeaders>();
    for (const t of teams ?? []) m.set(t.abbreviation, t);
    return m;
  }, [teams]);

  const now = useMemo(() => new Date(), []);
  const hero = useMemo(() => {
    if (games && games.length > 0) {
      const h = computeHero(games, now, 7);
      if (h) return h;
    }
    if (nextGames && nextGames.length > 0) {
      const byDate = new Map<string, Game[]>();
      for (const g of nextGames) {
        const key =
          g.gameDate ?? (g.gameDateTime ? new Date(g.gameDateTime).toISOString().slice(0, 10) : '');
        if (!key) continue;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(g);
      }
      const sortedKeys = Array.from(byDate.keys()).sort();
      if (sortedKeys.length > 0) {
        const key = sortedKeys[0];
        return { dateKey: key, date: new Date(`${key}T12:00:00.000Z`), games: byDate.get(key)! };
      }
    }
    if (games && games.length > 0) {
      return computeHero(games, now, 180);
    }
    return null;
  }, [games, nextGames, now]);

  const heroGames = hero?.games ?? [];
  const heroDateKey = hero?.dateKey ?? null;

  useEffect(() => {
    setIdx(0);
  }, [heroDateKey]);

  const go = useCallback(
    (next: number) => {
      if (heroGames.length === 0) return;
      const n = ((next % heroGames.length) + heroGames.length) % heroGames.length;
      setIdx(n);
    },
    [heroGames.length],
  );

  const isTodayHero = hero ? hero.dateKey === now.toISOString().slice(0, 10) : false;
  const isFutureHero = hero ? hero.dateKey > now.toISOString().slice(0, 10) : false;
  const offseason = !loading && (!hero || heroGames.length === 0);
  const heroSeason = useMemo(() => getHeroSeasonSummary(heroGames), [heroGames]);
  const seasonStart = new Date('2026-10-20T00:00:00Z');
  const daysUntil = Math.max(
    0,
    Math.ceil((seasonStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
          <div className="h-6 w-48 animate-pulse rounded bg-white/20" />
          <div className="h-8 w-20 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="flex h-[340px] items-center justify-center p-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-navy" />
        </div>
      </div>
    );
  }

  if (offseason) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
          <h2 className="font-heading text-2xl font-black uppercase tracking-wide text-white">
            Offseason
          </h2>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            No games this week
          </span>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-navy to-brand-navyDark p-8 text-center sm:p-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(circle, white 1px, transparent 1.3px)',
              backgroundSize: '12px 12px',
            }}
          />
          <p className="relative font-heading text-5xl font-black leading-none text-white sm:text-6xl">
            SEASON STARTS
          </p>
          <p className="relative font-heading text-5xl font-black leading-none text-brand-gold sm:text-6xl">
            OCT 21
          </p>
          <p className="relative mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
            {daysUntil} DAYS — 2025-26 Season
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-2xl font-black uppercase tracking-wide text-white">
            {heroSeason && heroSeason.variant !== 'mixed' ? `${heroSeason.label} • ` : ''}
            {isTodayHero ? 'Tonight' : isFutureHero ? 'Opening Day' : 'Next Up'} —{' '}
            {hero ? formatHeroDateLabel(hero.date) : ''}
          </h2>
          {heroSeason && heroSeason.variant !== 'mixed' && heroSeason.variant !== 'regular' && (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ${
                heroSeason.variant === 'preseason'
                  ? 'bg-amber-400 text-stone-900 ring-amber-300'
                  : heroSeason.variant === 'playoffs'
                    ? 'bg-brand-red text-white ring-white/20'
                    : heroSeason.variant === 'allstar'
                      ? 'bg-brand-gold text-brand-navy ring-white/20'
                      : 'bg-white/15 text-white ring-white/20'
              }`}
            >
              {heroSeason.label}
            </span>
          )}
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            {heroGames.length} {heroGames.length === 1 ? 'Game' : 'Games'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous game"
            onClick={() => go(idx - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next game"
            onClick={() => go(idx + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            ›
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={() => setShowTopPlayer((v) => !v)}
            aria-pressed={showTopPlayer}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest shadow-md ring-1 transition backdrop-blur ${
              showTopPlayer
                ? 'bg-white text-brand-navy ring-white'
                : 'bg-white/15 text-white ring-white/20 hover:bg-white/20'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${showTopPlayer ? 'bg-brand-gold' : 'bg-white/60'}`}
            />
            Top Player
          </button>
        </div>
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {heroGames.map((g) => (
            <HeroSlide key={g.id} g={g} byAbbr={byAbbr} showTopPlayer={showTopPlayer} />
          ))}
        </div>
        {heroGames.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {heroGames.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to game ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
