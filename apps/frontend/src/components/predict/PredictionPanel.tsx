import { useMemo, useState } from 'react';
import { AlertCircle, Check, Lock, Trash2, Trophy } from 'lucide-react';
import { useOddsPreview, usePlacePick, useRemovePick } from '../../lib/api';
import type { Game, OddsSidePreview, TeamWithLeaders } from '../../lib/api';
import {
  buildTeamLookup,
  getGameStatus,
  getSeasonBadge,
  resolveGameTeams,
} from '../../lib/game-utils';
import { hexLuminance } from '../dashboard/shared';
import { formatPoints, picksOf, usePredictions, type SavedPrediction } from './predictions';

function ConfettiMark() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute h-2 w-2 rotate-45 rounded-[2px]"
          style={{
            left: `${(i * 83) % 100}%`,
            top: '-8px',
            backgroundColor: ['#FDB927', '#C94D2E', '#1C4188', '#882233', '#43973B'][i % 5],
            animation: `confetti-drop ${0.8 + (i % 5) * 0.15}s ${i * 0.05}s cubic-bezier(0.16,1,0.3,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * What the weighted mode pays, resolved in the order the state becomes known:
 * a settled result, then the price locked at submit, then the pending and live
 * odds states that lead up to it.
 */
function weightedReturnLabel({
  pick,
  oddsForSide,
  oddsLoading,
  oddsAvailable,
}: {
  pick: SavedPrediction | undefined;
  oddsForSide: OddsSidePreview | null;
  oddsLoading: boolean;
  oddsAvailable: boolean;
}): string {
  if (pick?.points != null) return formatPoints(pick.points);
  if (pick?.lockedDecimal != null) {
    return `locked ${pick.lockedDecimal.toFixed(2)} · ${oddsForSide?.weighted ?? '—'} pts if correct`;
  }
  if (pick?.pendingPrice) return 'Awaiting the opening line';
  if (oddsLoading) return 'Loading odds…';
  if (!oddsAvailable) return 'No line yet — the opening line will be used';
  if (oddsForSide)
    return `${oddsForSide.decimal.toFixed(2)} · ${oddsForSide.weighted} pts if correct`;
  return 'Pick a team to see the return';
}

export function PredictionPanel({
  game,
  teams,
  accentColor,
}: {
  game: Game;
  teams?: TeamWithLeaders[] | null;
  accentColor: string;
}) {
  const lookup = useMemo(() => buildTeamLookup(teams), [teams]);
  const { away, home } = useMemo(() => resolveGameTeams(game, lookup), [game, lookup]);

  const awayColor = away?.primaryColor ?? '#2B2B2B';
  const homeColor = home?.primaryColor ?? '#1C4188';

  const awayAbbr =
    away?.abbreviation ??
    (game.awayTricode ? game.awayTricode : game.awayTeam.slice(0, 3).toUpperCase());
  const homeAbbr =
    home?.abbreviation ??
    (game.homeTricode ? game.homeTricode : game.homeTeam.slice(0, 3).toUpperCase());

  const awayName = away?.teamName ?? game.awayTeam;
  const homeName = home?.teamName ?? game.homeTeam;

  const status = getGameStatus(game);
  const locked = status !== 'scheduled';

  const gamePicks = usePredictions()[game.id];
  const placePick = usePlacePick();
  const removePick = useRemovePick();
  const odds = useOddsPreview(game.id, !locked);

  const [pick, setPick] = useState<'away' | 'home' | null>(null);
  const [justPlaced, setJustPlaced] = useState(false);

  const existing = picksOf(gamePicks);
  // Fall back to what is already saved, so returning to a game shows the side
  // that was locked in without an effect to sync it.
  const side = pick ?? existing[0]?.pick ?? null;
  const hasExisting = existing.length > 0;

  const awayBright = hexLuminance(awayColor) > 0.45;
  const homeBright = hexLuminance(homeColor) > 0.45;
  const awayTx = awayBright ? 'text-brand-ink' : 'text-white';
  const homeTx = homeBright ? 'text-brand-ink' : 'text-white';

  const badge = getSeasonBadge(game);
  const pending = placePick.isPending || removePick.isPending;
  const error = placePick.error ?? removePick.error;

  const oddsForSide = side && odds.data?.available ? odds.data[side] : null;
  const weightedPick = gamePicks?.weighted;
  const flatPick = gamePicks?.flat;

  const submit = () => {
    if (!side) return;
    setJustPlaced(false);
    placePick.mutate(
      { gameId: game.id, side },
      {
        onSuccess: () => {
          setPick(null);
          setJustPlaced(true);
          window.setTimeout(() => setJustPlaced(false), 1400);
        },
      },
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-black uppercase tracking-wide text-white">
          <Trophy className="h-5 w-5 text-brand-gold" aria-hidden="true" />
          Make a Prediction
        </h2>
        {locked ? (
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white">
            <Lock className="h-3 w-3" aria-hidden="true" /> Locked
          </span>
        ) : (
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            {badge.label}
          </span>
        )}
      </div>

      <div className="relative p-5">
        {justPlaced && <ConfettiMark />}

        {locked && !hasExisting ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Lock className="h-6 w-6 text-stone-300" aria-hidden="true" />
            <p className="text-sm text-stone-500">Locked at tip-off.</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Predictions close once the game starts
            </p>
          </div>
        ) : (
          <>
            {/* Team picker — one side covers both modes */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              {(['away', 'home'] as const).map((s, index) => {
                const isAway = s === 'away';
                const color = isAway ? awayColor : homeColor;
                const tx = isAway ? awayTx : homeTx;
                const abbr = isAway ? awayAbbr : homeAbbr;
                const team = isAway ? away : home;
                const selected = side === s;
                return (
                  <div key={s} className="contents">
                    {index === 1 && (
                      <div className="flex flex-col items-center justify-center px-2">
                        <span className="font-heading text-2xl font-black italic text-stone-300">
                          VS
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => !locked && setPick(s)}
                      disabled={locked}
                      aria-pressed={selected}
                      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl px-3 py-5 ring-2 transition-all ${
                        selected
                          ? 'ring-brand-gold shadow-lg'
                          : 'ring-transparent hover:ring-black/10'
                      } ${locked ? 'cursor-default' : ''}`}
                      style={{ backgroundColor: color }}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-ink">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                      {team?.logoUrl ? (
                        <img
                          src={team.logoUrl}
                          alt={isAway ? awayName : homeName}
                          className="h-12 w-12 object-contain drop-shadow"
                          loading="lazy"
                        />
                      ) : (
                        <span className={`font-heading text-3xl font-black ${tx}`}>{abbr}</span>
                      )}
                      <span className={`text-xs font-bold uppercase tracking-wide ${tx}`}>
                        {abbr}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${tx} opacity-80`}
                      >
                        {isAway ? 'Away' : 'Home'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* What the one pick buys in each mode */}
            <dl className="mt-5 divide-y divide-brand-line overflow-hidden rounded-lg border border-brand-line">
              <div className="flex items-center justify-between gap-3 bg-stone-50 px-4 py-3">
                <dt className="text-xs font-black uppercase tracking-widest text-brand-ink">
                  Classic
                </dt>
                <dd className="text-[11px] text-stone-500">
                  {flatPick?.points != null ? formatPoints(flatPick.points) : '1 point if correct'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 bg-stone-50 px-4 py-3">
                <dt className="text-xs font-black uppercase tracking-widest text-brand-ink">
                  Weighted
                </dt>
                <dd className="text-right text-[11px] text-stone-500">
                  {weightedReturnLabel({
                    pick: weightedPick,
                    oddsForSide,
                    oddsLoading: odds.isLoading,
                    oddsAvailable: Boolean(odds.data?.available),
                  })}
                </dd>
              </div>
            </dl>

            {/* One control for both modes */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!side || pending || locked}
                className="flex-1 rounded-full px-6 py-3 text-sm font-extrabold uppercase tracking-widest text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: accentColor }}
              >
                {pending ? 'Saving…' : hasExisting ? 'Update pick' : 'Place pick'}
              </button>

              {hasExisting && !locked && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removePick.mutate(game.id, { onSuccess: () => setPick(null) })}
                  className="flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-stone-500 transition hover:text-brand-red disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>

            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-red/10 px-3 py-2 text-[11px] font-semibold text-brand-red">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error.message}
              </p>
            )}

            {!side && (
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-widest text-stone-400">
                Tap a team to choose your side
              </p>
            )}

            {side && !locked && (
              <p className="mt-3 text-center text-[11px] font-medium text-stone-400">
                One pick counts in both modes. Classic always pays 1; weighted pays the locked
                price.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
