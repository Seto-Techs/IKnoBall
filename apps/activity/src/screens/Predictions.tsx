import { useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import {
  ApiError,
  fetchOdds,
  fetchPicks,
  fetchSlate,
  fetchStandings,
  fetchTeams,
  messageOf,
  placePick,
  removePick,
  useResource,
  type Game,
  type OddsPreview,
  type Pick,
  type PickSide,
} from '../lib/api';
import {
  formatDateLabel,
  formatPoints,
  formatTimeET,
  gamePhase,
  relativeToTipoff,
  rewardLabel,
  shiftEtDate,
} from '../lib/game-utils';
import { buildClubIndex, resolveClub, type Club, type ClubIndex } from '../lib/teams';
import { EmptyNote, ErrorNote, Spinner, TeamMark } from '../components/kit';

/**
 * Tomorrow's slate — the same games the bot posts, because the bot's evening
 * message and this screen are the same product seen twice. The date is in the
 * header so nobody has to wonder which night they are looking at.
 *
 * One pick per game: the API locks the flat and weighted rows together on one
 * side, so the row asks for a winner and the reward is worded in points. No
 * price is ever shown — a decimal on a pick reads as a betting slip, and the
 * only number a player is deciding on here is the points.
 */

type RowState = 'open' | 'picked' | 'locked' | 'live' | 'settled';

export function Predictions() {
  const tomorrow = shiftEtDate(1);
  const slate = useResource(() => fetchSlate(tomorrow), tomorrow);
  const picks = useResource(fetchPicks);
  const teams = useResource(fetchTeams);
  const standings = useResource(fetchStandings);
  const odds = useResource(
    async () => {
      const games = slate.data ?? [];
      const entries = await Promise.all(
        games.map(async (game) => [game.id, await fetchOdds(game.id).catch(() => null)] as const),
      );
      return Object.fromEntries(entries) as Record<string, OddsPreview | null>;
    },
    slate.data?.map((game) => game.id).join(',') ?? '',
  );

  // The API returns both modes per game; a change here is local until the next
  // fetch, so a pick lands on screen without a round trip.
  const [placed, setPlaced] = useState<Record<string, Pick[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const index = useMemo(
    () => buildClubIndex(teams.data, standings.data),
    [teams.data, standings.data],
  );

  const picksByGame = useMemo(() => {
    const map = new Map<string, Pick[]>();
    for (const pick of picks.data ?? []) {
      map.set(pick.gameId, [...(map.get(pick.gameId) ?? []), pick]);
    }
    for (const [gameId, rows] of Object.entries(placed)) map.set(gameId, rows);
    return map;
  }, [picks.data, placed]);

  const games = useMemo(
    () =>
      [...(slate.data ?? [])].sort(
        (a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime(),
      ),
    [slate.data],
  );

  const picked = games.filter((game) => (picksByGame.get(game.id)?.length ?? 0) > 0).length;

  async function choose(game: Game, side: PickSide) {
    if (busy) return;
    setBusy(game.id);
    setNotice(null);
    try {
      const rows = await placePick(game.id, side);
      setPlaced((prev) => ({ ...prev, [game.id]: rows }));
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusy(null);
    }
  }

  async function clear(game: Game) {
    if (busy) return;
    setBusy(game.id);
    setNotice(null);
    try {
      await removePick(game.id);
      setPlaced((prev) => ({ ...prev, [game.id]: [] }));
    } catch (error) {
      // A pick that was already locked at tip-off cannot be withdrawn; the API
      // says so, and that sentence is worth more than a generic failure.
      setNotice(error instanceof ApiError ? error.message : messageOf(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-3 sm:px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.02em] text-brand-ink">
            Predictions
          </h1>
          {games.length > 0 && (
            <p className="text-[13px] font-semibold text-brand-navy">
              {picked} of {games.length} picked
            </p>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          <span className="text-brand-orange">Tomorrow</span>
          <span aria-hidden>·</span>
          <span>{formatDateLabel(tomorrow)}</span>
          <span aria-hidden>·</span>
          <span className="normal-case tracking-normal text-stone-500">
            Tap a team to call the winner
          </span>
        </p>
        {notice && <p className="mt-1.5 text-[13px] font-medium text-brand-red">{notice}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2 sm:px-4">
        <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
          {slate.loading ? (
            <Spinner label="Loading tomorrow’s slate" />
          ) : slate.error ? (
            <ErrorNote message={slate.error} />
          ) : games.length === 0 ? (
            <EmptyNote message="No games on tomorrow’s slate. Check back once the schedule is out." />
          ) : (
            <ul className="divide-y divide-brand-line">
              {games.map((game) => {
                const rows = picksByGame.get(game.id) ?? [];
                return (
                  <GameRow
                    key={game.id}
                    game={game}
                    rows={rows}
                    odds={odds.data?.[game.id] ?? null}
                    index={index}
                    busy={busy === game.id}
                    onPick={(side) => void choose(game, side)}
                    onClear={() => void clear(game)}
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── One game ──────────────────────────────────────────────── */

function GameRow({
  game,
  rows,
  odds,
  index,
  busy,
  onPick,
  onClear,
}: {
  game: Game;
  rows: Pick[];
  odds: OddsPreview | null;
  index: ClubIndex;
  busy: boolean;
  onPick: (side: PickSide) => void;
  onClear: () => void;
}) {
  const away = resolveClub(index, game.awayTricode, game.awayTeam);
  const home = resolveClub(index, game.homeTricode, game.homeTeam);

  const weighted = rows.find((row) => row.mode === 'weighted') ?? null;
  const settled = rows.find((row) => row.status === 'settled') ?? null;
  const side: PickSide | null = rows[0]?.side ?? null;

  const phase = gamePhase(game);
  const tipped = new Date(game.gameDateTime).getTime() <= Date.now();
  const state: RowState =
    phase === 'final'
      ? 'settled'
      : phase === 'live'
        ? 'live'
        : tipped
          ? 'locked'
          : side
            ? 'picked'
            : 'open';

  // A row that has been picked keeps its ordinary styling: the pick is marked on
  // the team itself and in the status cell, not by greying the row out. A pick
  // is a thing you did, not a thing that is no longer available.
  const locked = state === 'locked' || state === 'live';

  return (
    <li className="flex items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <TeamSide
          side="away"
          club={away}
          picked={side === 'away'}
          disabled={state !== 'open' || busy}
          onPick={() => onPick('away')}
        />
        <span
          className="shrink-0 px-0.5 font-heading text-[13px] font-bold uppercase tracking-[0.18em] text-stone-400"
          aria-hidden
        >
          vs
        </span>
        <TeamSide
          side="home"
          club={home}
          picked={side === 'home'}
          disabled={state !== 'open' || busy}
          onPick={() => onPick('home')}
        />
      </div>

      <div className="flex w-[9.25rem] shrink-0 flex-col items-end text-right sm:w-[10.5rem]">
        <p className={`text-[14px] font-semibold leading-tight ${rewardTone(state, settled)}`}>
          {rewardPrimary(state, odds, weighted, settled)}
        </p>
        {state === 'picked' ? (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="text-[12px] font-semibold text-brand-orange underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-50"
          >
            Undo pick
          </button>
        ) : (
          <p className="text-[12px] leading-tight text-stone-500">
            {rewardSecondary(state, odds, weighted, settled)}
          </p>
        )}
      </div>

      <div className="flex w-[6.75rem] shrink-0 flex-col items-end text-right sm:w-[8rem]">
        <p className="flex items-center gap-1 text-[13px] font-semibold leading-tight text-brand-ink">
          {locked && <Lock className="h-3.5 w-3.5 text-stone-400" aria-hidden />}
          {statusPrimary(state, game)}
        </p>
        <p className="text-[12px] leading-tight text-stone-500">{statusSecondary(state, game)}</p>
      </div>
    </li>
  );
}

function TeamSide({
  side,
  club,
  picked,
  disabled,
  onPick,
}: {
  side: PickSide;
  club: Club;
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  // Away mirrors home around the `vs`: both logos sit next to the divider, so
  // the pair reads as one matchup instead of two columns with a hole between.
  const away = side === 'away';

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={picked}
      aria-label={picked ? `${club.name} — your pick` : `Pick ${club.name}`}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${
        away ? 'flex-row-reverse text-right' : 'text-left'
      } ${disabled ? 'cursor-default' : 'hover:bg-brand-cream'}`}
    >
      <TeamMark club={club} size={34} />
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-center gap-1 text-[15px] leading-tight ${
            away ? 'justify-end' : ''
          } ${picked ? 'font-semibold text-brand-navyDark' : 'font-medium text-brand-ink'}`}
        >
          <span className="truncate">{club.name}</span>
          {picked && <Check className="h-4 w-4 shrink-0 text-brand-navy" aria-hidden />}
        </span>
        <span className="block text-[12px] leading-tight text-stone-500">
          {club.record ?? club.abbreviation}
        </span>
      </span>
    </button>
  );
}

/* ── Copy ──────────────────────────────────────────────────────
 * Points, never prices. The feed's decimal is a bookmaker's number and stays on
 * the server; what lands here is what the pick pays. Before a line exists there
 * is nothing honest to promise, so the row says when the points arrive instead
 * of inventing them.
 */

const POINTS_SCALE = 10;
const POINTS_CEILING = 150;

function pointsFrom(decimal: number | null | undefined): number | null {
  if (decimal == null) return null;
  return Math.min(Math.round(POINTS_SCALE * decimal), POINTS_CEILING);
}

function rewardTone(state: RowState, settled: Pick | null): string {
  if (state === 'settled' && settled) {
    return (settled.points ?? 0) > 0 ? 'text-brand-navyDark' : 'text-stone-500';
  }
  if (state === 'locked' || state === 'live') return 'text-stone-500';
  return 'text-brand-navyDark';
}

function rewardPrimary(
  state: RowState,
  odds: OddsPreview | null,
  weighted: Pick | null,
  settled: Pick | null,
): string {
  if (state === 'settled') {
    if (!settled) return 'Final';
    return formatPoints(settled.points ?? 0);
  }
  if (state === 'locked') return 'Picks closed';
  if (state === 'live') return 'In play';

  const locked = pointsFrom(weighted?.lockedDecimal);
  if (locked !== null) return rewardLabel(locked);

  const home = odds?.available ? pointsFrom(odds.home?.decimal) : null;
  const away = odds?.available ? pointsFrom(odds.away?.decimal) : null;
  if (home !== null || away !== null) {
    const best = Math.max(home ?? 0, away ?? 0);
    return rewardLabel(best);
  }

  return 'Points at tip-off';
}

function rewardSecondary(
  state: RowState,
  odds: OddsPreview | null,
  weighted: Pick | null,
  settled: Pick | null,
): string {
  if (state === 'settled') {
    if (!settled) return 'no pick';
    return (settled.points ?? 0) > 0 ? 'correct' : 'missed';
  }
  if (state === 'locked') return 'at tip-off';
  if (state === 'live') return 'locked in';
  if (weighted?.pendingPrice) return 'opening line pending';
  if (weighted?.lockedDecimal != null) return 'locked in';

  const home = odds?.available ? pointsFrom(odds.home?.decimal) : null;
  const away = odds?.available ? pointsFrom(odds.away?.decimal) : null;
  if (home !== null && away !== null && home !== away) {
    return `or ${formatPoints(Math.min(home, away))} the other way`;
  }
  return 'flat pick pays 1 pt';
}

function statusPrimary(state: RowState, game: Game): string {
  if (state === 'settled') return 'Final';
  if (state === 'live') return game.status || 'Live';
  return game.status || formatTimeET(game.gameDateTime);
}

function statusSecondary(state: RowState, game: Game): string {
  if (state === 'settled' || state === 'live') {
    if (game.homeScore != null && game.awayScore != null) {
      return `${game.awayScore}–${game.homeScore}`;
    }
    return state === 'live' ? 'in play' : 'no score';
  }
  if (state === 'locked') return 'locked';
  return relativeToTipoff(game.gameDateTime);
}
