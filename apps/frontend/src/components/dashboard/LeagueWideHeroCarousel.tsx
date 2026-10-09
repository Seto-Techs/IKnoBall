import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { useTopPlayers } from '../../lib/api';
import {
  canonicalAbbr,
  formatTimeET,
  getGameStatus,
  getSeasonBadge,
  hexLuminance,
} from '../../lib/game-utils';
import { MatchupBackdrop } from './MatchupBackdrop';

function getTeamByTricode(
  tricode: string | null | undefined,
  byAbbr: Map<string, TeamWithLeaders>,
): TeamWithLeaders | null {
  const abbr = canonicalAbbr(tricode);
  return byAbbr.get(abbr) ?? null;
}

function formatHeroDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  const navigate = useNavigate();
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
  // The spine sits on the seam between the two team colours, so a bright primary on
  // either side washes out its translucent surfaces. Same guard the other panels use.
  const spineOnBright = hexLuminance(awayColor) > 0.45 || hexLuminance(homeColor) > 0.45;
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
      // Below sm the slide is height-driven: VS stays centred, the badge rides above it,
      // and the meta group needs its own room plus the band the page indicator sits in.
      // 280 was sized for the old overlay layout, where the CTA and the dots collided.
      style={{ minHeight: showTopPlayer ? 400 : 320 }}
    >
      <MatchupBackdrop awayColor={awayColor} homeColor={homeColor} />

      <div className="relative flex flex-1 items-stretch justify-between px-4 sm:px-6">
        {renderTeamOrPlayer('away', away, awayFullName, awayAbbr, awayLogo, awayTop, awayLoading)}

        {/* Center spine — VS stays dead-centre on the logos' axis; the season badge is
            anchored above it so it can never move VS; the meta group flows at the bottom
            and reserves the band the carousel's page indicator sits in. */}
        <div className="relative flex w-[168px] shrink-0 flex-col items-center self-stretch px-2 sm:w-[220px] sm:px-4">
          {/* VS + badge, one anchored unit. inset-x matches the spine's padding so the
              badge's max-w-full is exactly the column's content width. */}
          <div className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 justify-center sm:inset-x-4">
            <span
              className="font-heading text-3xl font-black italic leading-none tracking-[0.06em] text-white sm:text-4xl"
              style={
                {
                  WebkitTextStroke: '1.5px rgba(0,0,0,0.5)',
                  textShadow: '0 4px 12px rgba(0,0,0,0.4)',
                } as React.CSSProperties
              }
            >
              VS
            </span>

            {seasonBadge && (
              <span
                title={seasonBadge.detail ?? undefined}
                className={`absolute bottom-full left-1/2 mb-3 max-w-full -translate-x-1/2 truncate rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] shadow ring-1 ${
                  seasonBadge.variant === 'preseason'
                    ? 'bg-amber-400 text-stone-900 ring-amber-300'
                    : seasonBadge.variant === 'playoffs'
                      ? 'bg-brand-red text-white ring-white/20'
                      : seasonBadge.variant === 'allstar'
                        ? 'bg-brand-gold text-brand-navy ring-white/20'
                        : 'bg-white/20 text-white ring-white/30 backdrop-blur'
                }`}
              >
                {seasonBadge.label}
                {seasonBadge.detail ? ` • ${seasonBadge.detail}` : ''}
              </span>
            )}
          </div>

          {/* Meta — in flow, pinned to the bottom. pb-7/pb-8 clears the page indicator,
              which is absolutely positioned at bottom-3 in the carousel. */}
          <div className="mt-auto flex flex-col items-center gap-2 pb-7 sm:gap-3 sm:pb-8">
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow ${pillClass}`}
            >
              {pillText}
            </span>
            <span
              className={`inline-flex max-w-[152px] items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white ring-1 backdrop-blur sm:max-w-[200px] sm:px-3 sm:text-xs ${
                spineOnBright ? 'bg-black/40 ring-white/30' : 'bg-black/25 ring-white/20'
              }`}
            >
              <MapPin className="h-3 w-3 shrink-0 text-white/80" aria-hidden="true" />
              <span className="truncate">
                {g.arenaName ? g.arenaName : `${awayAbbr} @ ${homeAbbr}`}
              </span>
            </span>
            {isFinal ? (
              <button
                type="button"
                onClick={() => navigate({ to: '/game/$gameId', params: { gameId: g.id } })}
                className="whitespace-nowrap rounded-md bg-stone-700 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/40 shadow transition hover:bg-stone-600"
              >
                View Recap
              </button>
            ) : isLive ? (
              <button
                type="button"
                onClick={() => navigate({ to: '/game/$gameId', params: { gameId: g.id } })}
                className="whitespace-nowrap rounded-md bg-brand-red px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow transition hover:brightness-110"
              >
                Watch Live
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate({ to: '/game/$gameId', params: { gameId: g.id } })}
                className="whitespace-nowrap rounded-md bg-white px-5 py-2.5 text-xs font-black uppercase tracking-widest text-brand-navy shadow transition hover:brightness-95"
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next game"
            onClick={() => go(idx + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-black uppercase tracking-widest shadow-md ring-1 transition backdrop-blur ${
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
