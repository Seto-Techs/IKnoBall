import { useMemo, type CSSProperties } from 'react';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { formatGameDate, formatTimeET, getGameStatus, getSeasonBadge } from '../../lib/game-utils';

function statusPill(g: Game): { text: string; cls: string } {
  const status = getGameStatus(g);
  if (status === 'final') return { text: 'Final', cls: 'bg-stone-900 text-white' };
  if (status === 'live')
    return { text: '● Live', cls: 'bg-brand-red text-white animate-pulse' };
  return { text: `${formatTimeET(g.gameDateTime)} ET`, cls: 'bg-brand-navyDark text-white' };
}

const VS_STYLE: CSSProperties = {
  WebkitTextStroke: '1.6px rgba(0,0,0,0.6)',
  paintOrder: 'stroke fill',
  textShadow: '0 4px 18px rgba(0,0,0,0.48)',
};

const SCORE_STYLE: CSSProperties = {
  WebkitTextStroke: '1.2px rgba(0,0,0,0.6)',
  paintOrder: 'stroke fill',
  textShadow: '0 3px 14px rgba(0,0,0,0.45)',
};

export function MatchupHero({
  game,
  away,
  home,
  onBack,
}: {
  game: Game;
  away: TeamWithLeaders | null;
  home: TeamWithLeaders | null;
  onBack?: () => void;
}) {
  const awayColor = away?.primaryColor ?? '#2B2B2B';
  const homeColor = home?.primaryColor ?? '#1C4188';

  const awayMark = away?.logoUrl ?? null;
  const homeMark = home?.logoUrl ?? null;
  const awayAbbr =
    away?.abbreviation ?? game.awayTricode ?? game.awayTeam.slice(0, 3).toUpperCase();
  const homeAbbr =
    home?.abbreviation ?? game.homeTricode ?? game.homeTeam.slice(0, 3).toUpperCase();
  const awayName = away?.teamName ?? game.awayTeam;
  const homeName = home?.teamName ?? game.homeTeam;

  const arenaLine = game.arenaName
    ? [game.arenaName, game.arenaCity].filter(Boolean).join(' • ')
    : `${awayName} @ ${homeName}`;

  const dateLabel = formatGameDate(game.gameDateTime, 'EEEE, MMMM d, yyyy');
  const pill = useMemo(() => statusPill(game), [game]);
  const badge = getSeasonBadge(game);
  // The score only means something once the game is under way.
  const showScore = getGameStatus(game) !== 'scheduled';

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-line shadow-sm">
      <div className="absolute inset-0 flex overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: awayColor, clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)' }}
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
        <div className="absolute inset-x-0 top-0 h-px bg-black/25" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-black/20" />
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-black/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
        </button>
      )}

      {/* Meta strip */}
      <div className="relative z-10 flex items-center justify-center gap-3 px-20 pt-5">
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest shadow ${pill.cls}`}
        >
          {pill.text}
        </span>
        <span className="hidden rounded-full bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur sm:inline-flex">
          {badge.label}
          {badge.detail ? ` • ${badge.detail}` : ''}
        </span>
      </div>

      {/* Teams */}
      <div className="relative z-10 flex min-h-[240px] items-stretch px-6 pb-6 pt-6 sm:min-h-[280px] sm:px-8">
        {/* Away */}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          {awayMark ? (
            <img
              src={awayMark}
              alt={awayName}
              className="h-20 w-20 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.4)] sm:h-36 sm:w-36"
              loading="lazy"
            />
          ) : (
            <span
              className="font-heading text-5xl font-black tracking-tighter text-white sm:text-6xl"
              style={{
                WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                textShadow: '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              {awayAbbr}
            </span>
          )}
          <span
            className="font-heading text-xl font-black uppercase tracking-wide text-white sm:text-[32px]"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
          >
            {awayName}
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-white/75">Away</span>
        </div>

        {/* Away score — between the away block and the VS group */}
        {showScore && (
          <span
            className="flex shrink-0 items-center px-1 font-heading text-3xl font-black leading-none tabular-nums text-white sm:px-2 sm:text-6xl"
            style={SCORE_STYLE}
          >
            {game.awayScore ?? 0}
          </span>
        )}

        {/* VS + meta */}
        <div className="flex w-[96px] shrink-0 flex-col items-center justify-center gap-2 sm:w-[380px]">
          <span
            className="font-heading text-xl font-black italic leading-none tracking-[0.04em] text-white sm:text-[32px]"
            style={VS_STYLE}
          >
            VS
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {dateLabel}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-white/80">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {arenaLine}
            </span>
          </div>
        </div>

        {/* Home score — between the VS group and the home block */}
        {showScore && (
          <span
            className="flex shrink-0 items-center px-1 font-heading text-3xl font-black leading-none tabular-nums text-white sm:px-2 sm:text-6xl"
            style={SCORE_STYLE}
          >
            {game.homeScore ?? 0}
          </span>
        )}

        {/* Home */}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          {homeMark ? (
            <img
              src={homeMark}
              alt={homeName}
              className="h-20 w-20 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.4)] sm:h-36 sm:w-36"
              loading="lazy"
            />
          ) : (
            <span
              className="font-heading text-5xl font-black tracking-tighter text-white sm:text-6xl"
              style={{
                WebkitTextStroke: '1px rgba(0,0,0,0.45)',
                textShadow: '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              {homeAbbr}
            </span>
          )}
          <span
            className="font-heading text-xl font-black uppercase tracking-wide text-white sm:text-[32px]"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
          >
            {homeName}
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-white/75">Home</span>
        </div>
      </div>
    </div>
  );
}
