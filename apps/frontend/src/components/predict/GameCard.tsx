import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import {
  buildTeamLookup,
  formatTimeET,
  getGameStatus,
  getSeasonBadge,
  resolveGameTeams,
} from '../../lib/game-utils';
import {
  MatchupBackdrop,
  MATCHUP_LOGO_SHADOW,
  MATCHUP_NAME_SHADOW,
} from '../dashboard/MatchupBackdrop';
import type { GamePicks, SavedPrediction } from './predictions';
import { formatPoints, picksOf } from './predictions';

export interface TeamRecord {
  wins: number;
  losses: number;
}

type Outcome = 'hit' | 'miss' | null;

/**
 * Whether a pick came in. Null while the game is unfinished, so an in-progress
 * game is never labelled.
 */
function outcomeOf(
  pick: SavedPrediction,
  status: string,
  awayScore: number | null | undefined,
  homeScore: number | null | undefined,
): Outcome {
  if (status !== 'final' || awayScore == null || homeScore == null) return null;
  const awayWon = awayScore > homeScore;
  return (pick.pick === 'away') === awayWon ? 'hit' : 'miss';
}

const MODE_LABEL: Record<SavedPrediction['mode'], string> = {
  flat: 'Flat',
  weighted: 'Weighted',
};

const SEASON_PILL: Record<string, string> = {
  preseason: 'bg-amber-400 text-stone-900 ring-amber-300',
  playoffs: 'bg-brand-red text-white ring-white/20',
  allstar: 'bg-brand-gold text-brand-navy ring-white/20',
  regular: 'bg-white/20 text-white ring-white/30 backdrop-blur',
};

/*
 * Display only. Picking happens on the game detail page, never on the slate,
 * so nothing here is a button.
 *
 * The pick is shown two ways at once: the picked team keeps full color while the
 * other is dimmed, and a gold rail marks the picked side's outer edge. No icon,
 * so it reads at a glance without adding furniture.
 */
function TeamHalf({
  side,
  name,
  abbr,
  logoUrl,
  score,
  record,
  open,
  picked,
  dimmed,
  outcome,
}: {
  side: 'away' | 'home';
  name: string;
  abbr: string;
  logoUrl: string | undefined;
  score: number | null | undefined;
  record: TeamRecord | undefined;
  open: boolean;
  picked: boolean;
  dimmed: boolean;
  outcome: 'hit' | 'miss' | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  const pickLabel =
    outcome === 'hit'
      ? 'Your pick · Correct'
      : outcome === 'miss'
        ? 'Your pick · Missed'
        : 'Your pick';
  const pickTone =
    outcome === 'miss'
      ? 'text-brand-red'
      : outcome === 'hit'
        ? 'text-emerald-300'
        : 'text-brand-gold';

  return (
    <div
      className={`relative flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-5 text-center transition-opacity duration-300 ${
        dimmed ? 'opacity-40 saturate-50' : ''
      }`}
    >
      {picked && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-3 w-1.5 rounded-full bg-brand-gold shadow-[0_0_12px_rgba(253,185,39,0.7)] ${
            side === 'away' ? 'left-2' : 'right-2'
          }`}
        />
      )}

      {logoUrl && !logoFailed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-16 w-16 object-contain sm:h-20 sm:w-20"
          style={{ filter: `drop-shadow(${MATCHUP_LOGO_SHADOW})` }}
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span
          className="font-heading text-4xl font-black tracking-tighter text-white"
          style={{ WebkitTextStroke: '1px rgba(0,0,0,0.45)' }}
        >
          {abbr}
        </span>
      )}

      <span
        className="font-heading text-center text-lg font-black leading-tight tracking-wide text-white sm:text-2xl"
        style={{ textShadow: MATCHUP_NAME_SHADOW }}
      >
        {name}
      </span>

      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
        {side === 'away' ? 'Away' : 'Home'}
        {record && (
          <span className="tabular-nums text-white/60">
            {record.wins}-{record.losses}
          </span>
        )}
      </span>

      {!open && (
        <span
          className="font-heading text-3xl font-black leading-none tabular-nums text-white"
          style={{ textShadow: MATCHUP_NAME_SHADOW }}
        >
          {score ?? '—'}
        </span>
      )}

      {picked && (
        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${pickTone}`}>
          {pickLabel}
        </span>
      )}
    </div>
  );
}

export function GameCard({
  game,
  teams,
  picks,
  records,
  accentColor,
}: {
  game: Game;
  teams: TeamWithLeaders[] | null | undefined;
  picks: GamePicks | undefined;
  records?: Map<string, TeamRecord>;
  accentColor: string;
}) {
  const lookup = useMemo(() => buildTeamLookup(teams), [teams]);
  const { away, home } = useMemo(() => resolveGameTeams(game, lookup), [game, lookup]);

  const status = getGameStatus(game);
  const open = status === 'scheduled';
  const badge = getSeasonBadge(game);

  const awayAbbr =
    away?.abbreviation ?? game.awayTricode ?? game.awayTeam.slice(0, 3).toUpperCase();
  const homeAbbr =
    home?.abbreviation ?? game.homeTricode ?? game.homeTeam.slice(0, 3).toUpperCase();
  const awayName = away?.teamName ?? game.awayTeam;
  const homeName = home?.teamName ?? game.homeTeam;

  // Both modes must name the same side, so one side describes the whole game.
  const pickList = picksOf(picks);
  const pickedSide = pickList[0]?.pick ?? null;
  const outcome: Outcome = pickList[0]
    ? outcomeOf(pickList[0], status, game.awayScore, game.homeScore)
    : null;
  const pickedAbbr = pickedSide ? (pickedSide === 'away' ? awayAbbr : homeAbbr) : null;

  const timeLabel = formatTimeET(game.gameDateTime);
  const pillText =
    status === 'final'
      ? `Final ${game.awayScore ?? 0}-${game.homeScore ?? 0}`
      : status === 'live'
        ? `● Live ${game.awayScore ?? 0}-${game.homeScore ?? 0}`
        : `${timeLabel} ET`;
  const pillClass =
    status === 'final'
      ? 'bg-stone-800 text-white'
      : status === 'live'
        ? 'bg-brand-red text-white animate-pulse'
        : 'bg-white text-brand-navy';

  const venue = game.arenaName ?? `${awayAbbr} @ ${homeAbbr}`;

  const hasPick = pickList.length > 0;
  // Only dim while the pick is still the live decision. Once a game is final or
  // live, greying the team that actually won fights the result, so the rail and
  // the label carry the pick on their own.
  const dimUnpicked = hasPick && open;

  // The pick is made on the game detail page; this card only opens it.
  const actionLabel =
    status === 'final' ? 'Recap' : status === 'live' ? 'Watch' : hasPick ? 'Edit pick' : 'Predict';

  return (
    <article className="relative overflow-hidden rounded-xl border border-brand-line shadow-sm">
      <MatchupBackdrop
        awayColor={away?.primaryColor ?? '#2B2B2B'}
        homeColor={home?.primaryColor ?? '#1C4188'}
        className={status === 'final' ? 'opacity-[0.9] saturate-[0.75]' : ''}
      />

      <div className="relative flex flex-col">
        <div className="flex items-stretch">
          <TeamHalf
            side="away"
            name={awayName}
            abbr={awayAbbr}
            logoUrl={away?.logoUrl}
            score={game.awayScore}
            record={records?.get(awayAbbr)}
            open={open}
            picked={pickedSide === 'away'}
            dimmed={dimUnpicked && pickedSide !== 'away'}
            outcome={pickedSide === 'away' ? outcome : null}
          />

          <div className="relative flex w-20 shrink-0 flex-col items-center justify-center gap-2 px-1 py-3 sm:w-24">
            {badge.variant !== 'regular' && (
              <span
                title={badge.detail ?? undefined}
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] shadow ring-1 ${SEASON_PILL[badge.variant] ?? SEASON_PILL.regular}`}
              >
                {badge.label}
              </span>
            )}
            <span
              className="font-heading text-3xl font-black italic leading-none tracking-[0.06em] text-white sm:text-4xl"
              style={{
                WebkitTextStroke: '1.5px rgba(0,0,0,0.5)',
                textShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              VS
            </span>
          </div>

          <TeamHalf
            side="home"
            name={homeName}
            abbr={homeAbbr}
            logoUrl={home?.logoUrl}
            score={game.homeScore}
            record={records?.get(homeAbbr)}
            open={open}
            picked={pickedSide === 'home'}
            dimmed={dimUnpicked && pickedSide !== 'home'}
            outcome={pickedSide === 'home' ? outcome : null}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-white/15 px-3 py-3">
          <span
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest shadow ${pillClass}`}
          >
            {pillText}
          </span>

          <span className="inline-flex max-w-[220px] items-center gap-1 whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-[11px] font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur">
            <MapPin className="h-3 w-3 shrink-0 text-white/80" aria-hidden="true" />
            <span className="truncate">{venue}</span>
          </span>

          {pickList.length ? (
            pickList.map((entry) => {
              const entryOutcome = outcomeOf(entry, status, game.awayScore, game.homeScore);
              const tone =
                entryOutcome === 'miss'
                  ? 'bg-brand-red/80 text-white ring-white/30'
                  : entryOutcome === 'hit'
                    ? 'bg-emerald-600/85 text-white ring-white/30'
                    : 'bg-white/20 text-white ring-white/30';
              // Settled picks show what they scored; open ones show the locked
              // price so the payout is visible before the game resolves. A
              // weighted pick with no price yet says so rather than looking broken.
              const detail =
                entry.points != null
                  ? formatPoints(entry.points)
                  : entry.lockedDecimal != null
                    ? entry.lockedDecimal.toFixed(2)
                    : entry.pendingPrice
                      ? 'awaiting line'
                      : null;
              return (
                <span
                  key={entry.mode}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ring-1 backdrop-blur ${tone}`}
                >
                  {MODE_LABEL[entry.mode]}: {pickedAbbr}
                  {detail ? ` · ${detail}` : ''}
                </span>
              );
            })
          ) : (
            <span className="whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/70 ring-1 ring-white/20 backdrop-blur">
              {open ? 'Not picked' : 'No pick'}
            </span>
          )}

          <Link
            to="/game/$gameId"
            params={{ gameId: game.id }}
            className="whitespace-nowrap rounded-md px-5 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ backgroundColor: accentColor }}
          >
            {actionLabel} →
          </Link>
        </div>
      </div>
    </article>
  );
}
