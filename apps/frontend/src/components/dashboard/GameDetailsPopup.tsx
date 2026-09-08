import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, MapPin, X } from 'lucide-react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { formatGameDate } from './shared';
function opponentOf(game: Game, team: TeamWithLeaders, teams?: TeamWithLeaders[] | null) {
  const isHome = game.homeTeam === team.fullName || game.homeTeam === team.teamName;
  const oppName = isHome ? game.awayTeam : game.homeTeam;
  const opp =
    (teams ?? []).find(
      (t) => t.fullName === oppName || t.teamName === oppName || t.abbreviation === oppName,
    ) ?? null;
  return { isHome, oppName, opp };
}

function showToast(message: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  el.className =
    'fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-brand-navyDark px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 ' +
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
export function GameDetailsPopup({
  game,
  team,
  teams,
  open,
  onClose,
}: {
  game: Game | null;
  team: TeamWithLeaders;
  teams?: TeamWithLeaders[] | null;
  open: boolean;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [render, setRender] = useState(open);
  const [visible, setVisible] = useState(false);

  // mount/unmount with animation
  useEffect(() => {
    if (open) {
      setRender(true);
      // next frame -> animate in
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRender(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // scroll lock + focus management
  useEffect(() => {
    if (!render || !game) return;

    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // focus close button
    const timer = setTimeout(() => closeBtnRef.current?.focus(), 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      // return focus
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus();
      }
    };
  }, [render, game, onClose]);

  if (!render || !game) return null;
  if (typeof document === 'undefined') return null;

  const { isHome, oppName, opp } = opponentOf(game, team, teams);
  const oppColor = opp?.primaryColor ?? '#E8E3DD';
  const favColor = team.primaryColor || '#1C4188';
  const homeColor = isHome ? favColor : oppColor;
  const awayColor = isHome ? oppColor : favColor;
  // design-taste: gradient meets at VS — 8 variance, left = away, right = home
  const leftColor = awayColor;
  const rightColor = homeColor;
  // status
  const statusLower = (game.status ?? '').toLowerCase();
  const isFinal = statusLower.includes('final');
  const isLive =
    statusLower.includes('live') ||
    statusLower.includes('in progress') ||
    statusLower.includes('halftime');
  const statusLabel = isFinal ? 'Final' : isLive ? 'Live' : game.status || 'Scheduled';

  const statusPillClass = isFinal
    ? 'bg-stone-900 text-white'
    : isLive
      ? 'bg-brand-red text-white animate-pulse'
      : 'bg-brand-navyDark text-white';

  const isPreseason = (game.gameLabel ?? '') === 'Preseason';
  const isAllStar =
    (game.gameLabel ?? '') === 'All-Star' || (game.gameLabel ?? '') === 'All-Star Championship';
  const isPlayoffsPopup = !!(game.seriesText ?? '').trim();

  // time formatting - local time
  let timeLabel = '';
  let dateLabel = '';
  try {
    const d = new Date(game.gameDateTime);
    if (!Number.isNaN(d.getTime())) {
      dateLabel = formatGameDate(game.gameDateTime, 'EEEE, MMMM d, yyyy');
      timeLabel = formatGameDate(game.gameDateTime, 'h:mm a');
      // append timezone short if available
      const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(d)
        .find((p) => p.type === 'timeZoneName')?.value;
      if (tz) timeLabel += ` ${tz}`;
    }
  } catch {
    timeLabel = game.gameDateTime;
  }

  const arenaName = game.arenaName || opp?.arena || team.arena || '';
  const arenaCity = game.arenaCity || '';
  const arenaLine = arenaName
    ? arenaCity
      ? `${arenaName} • ${arenaCity}${game.arenaState ? `, ${game.arenaState}` : ''}`
      : arenaName
    : '';

  const scoreLine =
    game.homeScore != null && game.awayScore != null
      ? {
          home: game.homeScore,
          away: game.awayScore,
          isFavWin: isHome
            ? (game.homeScore ?? 0) > (game.awayScore ?? 0)
            : (game.awayScore ?? 0) > (game.homeScore ?? 0),
        }
      : null;

  const handlePredict = () => {
    onClose();
    // slight delay so toast appears after close animation starts
    setTimeout(() => showToast('Predictions coming soon'), 180);
  };

  const content = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      aria-hidden={!visible}
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close popup"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backdropFilter: visible ? 'blur(2px)' : 'blur(0px)' } as React.CSSProperties}
      />

      {/* card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-popup-title"
        className={`relative flex max-h-[85dvh] w-full flex-col overflow-hidden border border-brand-line bg-white shadow-xl transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] max-sm:rounded-t-2xl sm:max-w-[480px] sm:rounded-lg ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 sm:translate-y-2'
        }`}
      >
        {/* close — liquid glass */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-stone-600 ring-1 ring-black/5 backdrop-blur-md transition hover:bg-white hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>

        {/* hero — split poster: sharp diagonal AWAY | HOME, halftone + grain + VS */}
        <div className="relative flex shrink-0 overflow-hidden" style={{ minHeight: 224 }}>
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* solid territories — sharp diagonal geometric division */}
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
            {/* layered photographic texture — depth + vignette */}
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
            {/* halftone dot patterns — per side */}
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
            {/* geometric overlays — skewed bars + hairlines */}
            <div className="absolute left-[-6%] top-[18%] h-[10px] w-[28%] -skew-x-[12deg] bg-white/10 ring-1 ring-white/10" />
            <div className="absolute right-[-4%] bottom-[16%] h-[10px] w-[26%] -skew-x-[12deg] bg-black/10 ring-1 ring-black/5" />
            <div className="absolute left-[8%] top-[8%] h-[22%] w-[1px] -skew-x-[12deg] bg-white/20" />
            <div className="absolute right-[10%] bottom-[10%] h-[18%] w-[1px] -skew-x-[12deg] bg-white/18" />
            {/* subtle grain */}
            <div
              className="absolute inset-0 opacity-[0.055] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
            {/* thin black accent strokes — diagonal seam */}
            <div className="absolute inset-x-0 top-0 h-px bg-black/25" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-black/20" />
          </div>
          <h2 id="game-popup-title" className="sr-only">
            {isHome
              ? `${opp?.teamName ?? oppName} at ${team.teamName}`
              : `${team.teamName} at ${opp?.teamName ?? oppName}`}{' '}
            — {dateLabel} {timeLabel}
          </h2>
          {/* status — top center */}
          <span
            className={`pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] shadow-sm ring-1 ring-black/10 ${statusPillClass}`}
          >
            {statusLabel} • {isHome ? 'vs' : '@'}{' '}
            {opp?.abbreviation ?? oppName.slice(0, 3).toUpperCase()}
          </span>
          {/* split content */}
          <div className="relative z-10 flex min-h-[224px] flex-1 items-stretch">
            {/* AWAY — left */}
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-6 pt-12 sm:px-6">
              {(isHome ? opp?.logoUrl : team.logoUrl) ? (
                <img
                  src={isHome ? (opp?.logoUrl ?? '') : team.logoUrl}
                  alt={isHome ? (opp?.fullName ?? oppName) : team.fullName}
                  className="h-[84px] w-[84px] object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.38)] sm:h-[102px] sm:w-[102px]"
                  loading="lazy"
                  style={{ willChange: 'transform' } as React.CSSProperties}
                />
              ) : (
                <span
                  className="font-heading text-3xl font-black tracking-tighter text-white sm:text-4xl"
                  style={
                    {
                      WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                      textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                    } as React.CSSProperties
                  }
                >
                  {isHome
                    ? (opp?.abbreviation ?? oppName.slice(0, 3).toUpperCase())
                    : team.abbreviation}
                </span>
              )}
              <span
                className="max-w-[14ch] text-center font-heading text-[11px] font-bold uppercase tracking-wide text-white/95 sm:text-xs"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                {isHome ? (opp?.teamName ?? oppName) : team.teamName}
              </span>
              <span
                className="font-heading text-[13px] font-black uppercase tracking-[0.22em] text-white sm:text-sm"
                style={
                  {
                    textShadow: '0 1px 8px rgba(0,0,0,0.55), 0 1px 1px rgba(0,0,0,0.7)',
                  } as React.CSSProperties
                }
              >
                AWAY
              </span>
            </div>
            {/* HOME — right */}
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-6 pt-12 sm:px-6">
              {(isHome ? team.logoUrl : opp?.logoUrl) ? (
                <img
                  src={isHome ? team.logoUrl : (opp?.logoUrl ?? '')}
                  alt={isHome ? team.fullName : (opp?.fullName ?? oppName)}
                  className="h-[84px] w-[84px] object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.38)] sm:h-[102px] sm:w-[102px]"
                  loading="lazy"
                  style={{ willChange: 'transform' } as React.CSSProperties}
                />
              ) : (
                <span
                  className="font-heading text-3xl font-black tracking-tighter text-white sm:text-4xl"
                  style={
                    {
                      WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                      textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                    } as React.CSSProperties
                  }
                >
                  {isHome
                    ? team.abbreviation
                    : (opp?.abbreviation ?? oppName.slice(0, 3).toUpperCase())}
                </span>
              )}
              <span
                className="max-w-[14ch] text-center font-heading text-[11px] font-bold uppercase tracking-wide text-white/95 sm:text-xs"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' } as React.CSSProperties}
              >
                {isHome ? team.teamName : (opp?.teamName ?? oppName)}
              </span>
              <span
                className="font-heading text-[13px] font-black uppercase tracking-[0.22em] text-white sm:text-sm"
                style={
                  {
                    textShadow: '0 1px 8px rgba(0,0,0,0.55), 0 1px 1px rgba(0,0,0,0.7)',
                  } as React.CSSProperties
                }
              >
                HOME
              </span>
            </div>
          </div>
          {/* VS — huge bold white centered on diagonal */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
            <span
              className="font-heading text-[46px] font-black italic leading-none tracking-[0.06em] text-white sm:text-[56px]"
              style={
                {
                  WebkitTextStroke: '1.8px rgba(0,0,0,0.62)',
                  paintOrder: 'stroke fill',
                  textShadow: '0 4px 18px rgba(0,0,0,0.48), 0 1px 0 rgba(0,0,0,0.7)',
                  filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))',
                } as React.CSSProperties
              }
            >
              VS
            </span>
            {scoreLine && isFinal && (
              <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white ring-1 ring-white/20 backdrop-blur">
                {scoreLine.isFavWin ? 'W' : 'L'}{' '}
                {isHome
                  ? `${scoreLine.home}-${scoreLine.away}`
                  : `${scoreLine.away}-${scoreLine.home}`}
              </span>
            )}
          </div>
        </div>

        {/* divider — hairline */}
        <div className="h-px w-full bg-brand-line/70" />

        {/* details — scrollable */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 sm:px-8">
          {/* date/time */}
          <div className="flex items-start gap-3 rounded-lg border border-brand-line bg-stone-50/70 px-4 py-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
              <Clock className="h-4 w-4 text-stone-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-brand-ink">{dateLabel}</div>
              <div className="text-sm text-stone-600">{timeLabel}</div>
              {/* season pill — below date and time, mirrors hero/calendar differentiation */}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {isPreseason ? (
                  <span className="inline-flex rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-900 ring-1 ring-amber-300">
                    Preseason
                  </span>
                ) : isAllStar ? (
                  <span className="inline-flex rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-brand-navy ring-1 ring-white/20">
                    All-Star
                  </span>
                ) : isPlayoffsPopup ? (
                  <span
                    className="inline-flex rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white ring-1 ring-white/20"
                    title={game.seriesText ?? undefined}
                  >
                    Playoffs{game.seriesText ? ` • ${game.seriesText}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-600 ring-1 ring-black/10">
                    Regular Season
                  </span>
                )}
              </div>
              {!isFinal && !isLive && (
                <div className="mt-1 text-xs font-medium uppercase tracking-widest text-stone-500">
                  Tip-off • {isHome ? 'Home' : 'Away'} game
                </div>
              )}
              {isLive && scoreLine && (
                <div className="mt-1 font-heading text-lg font-extrabold text-brand-ink">
                  {game.awayTeam} {scoreLine.away} — {scoreLine.home} {game.homeTeam}
                </div>
              )}
              {isFinal && scoreLine && (
                <div className="mt-1 font-heading text-lg font-extrabold text-brand-ink">
                  {game.awayTeam} {scoreLine.away} — {scoreLine.home} {game.homeTeam}
                </div>
              )}
            </div>
          </div>

          {/* arena */}
          {arenaLine && (
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                <MapPin className="h-4 w-4 text-stone-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-brand-ink">{arenaName}</div>
                {(arenaCity || game.arenaState) && (
                  <div className="text-sm text-stone-600">
                    {arenaCity}
                    {arenaCity && game.arenaState
                      ? `, ${game.arenaState}`
                      : (game.arenaState ?? '')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* context line */}
          <p className="px-1 text-xs leading-relaxed text-stone-500">
            {isHome
              ? `${team.fullName} host ${oppName} at ${arenaName || 'home court'}.`
              : `${team.fullName} visit ${oppName} at ${arenaName || 'opponent arena'}.`}
            {!isFinal && !isLive ? ' Make your prediction before tip-off.' : ''}
          </p>
        </div>

        {/* CTA footer */}
        <div className="shrink-0 border-t border-brand-line bg-white p-4 sm:p-5">
          {!isFinal && !isLive ? (
            <button
              type="button"
              onClick={handlePredict}
              className="flex w-full items-center justify-center rounded-full bg-brand-navyDark px-6 py-3 text-sm font-extrabold uppercase tracking-widest text-white ring-1 ring-black/5 transition hover:bg-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Predict this game
            </button>
          ) : isLive ? (
            <button
              type="button"
              onClick={handlePredict}
              className="flex w-full items-center justify-center rounded-full bg-stone-900 px-6 py-3 text-sm font-extrabold uppercase tracking-widest text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              Predict live
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-full border border-brand-line bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-widest text-brand-ink transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              Close
            </button>
          )}
          <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-widest text-stone-400">
            {isFinal ? 'Game final' : isLive ? 'Game in progress' : 'Scheduled'}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
