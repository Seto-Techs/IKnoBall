import { useMemo, useState } from 'react';
import { Check, Loader2, Lock, X } from 'lucide-react';
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

/** A settled pick's verdict. `null` means there is nothing to judge yet. */
type Outcome = 'hit' | 'miss' | null;

/**
 * The write in flight for one row: which game, and which side of it.
 *
 * `'clear'` is an undo, which has no side of its own — it spins in the status
 * cell where the undo lives. Tracking the side rather than a bare game id is
 * what lets the tapped team show the spinner instead of the row going quietly
 * unresponsive for the length of a round trip.
 */
type Pending = { gameId: string; side: PickSide | 'clear' };

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
  const [busy, setBusy] = useState<Pending | null>(null);
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
    setBusy({ gameId: game.id, side });
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
    setBusy({ gameId: game.id, side: 'clear' });
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
            Tap a team to call the winner — points if correct
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
                    busy={busy?.gameId === game.id ? busy.side : null}
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
  /** The write in flight on this row, or `null` when it is settled. */
  busy: PickSide | 'clear' | null;
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

  // Settlement pays nothing for a losing side, so the points are the verdict:
  // anything above zero came in, an explicit zero did not. A final with no pick,
  // or a settled row whose points have not landed, has no verdict to give.
  const points = settled?.points ?? null;
  const outcome: Outcome = points === null ? null : points > 0 ? 'hit' : 'miss';

  // A row that has been picked keeps its ordinary styling: the pick is marked on
  // the team itself and in the status cell, not by greying the row out. A pick
  // is a thing you did, not a thing that is no longer available.
  const locked = state === 'locked' || state === 'live';
  const writing = busy !== null;
  const awayReward = sideReward(state, odds, weighted, settled, 'away');
  const homeReward = sideReward(state, odds, weighted, settled, 'home');

  return (
    <li className="px-2.5 py-2 sm:px-4 sm:py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
        {/* The matchup is its own column, split from the result column beside
         * it: a pick mark at the card's outer edge sat past the score, reading
         * as a badge belonging to the result rather than to the team. Here the
         * marks are the column's outer gutters and the names sit inside them.
         *
         * The tracks are sized to the content, not `1fr`: a track that grows
         * leaves the mark stranded at the far edge of empty space, which is the
         * same orphaned tick as before, just inside the card. Sized tracks keep
         * every row's marks at the same x, and the group centres itself, so the
         * marks sit right beside the names they are for. */}
        <div className="grid w-full min-w-0 grid-cols-[1rem_5.5rem_auto_5.5rem_1rem] items-center justify-center gap-x-1.5 sm:grid-cols-[1rem_minmax(0,16rem)_auto_minmax(0,16rem)_1rem] sm:gap-x-2">
          <PickSlot picked={side === 'away'} pending={busy === 'away'} outcome={outcome} />
          <TeamSide
            side="away"
            club={away}
            reward={awayReward}
            outcome={outcome}
            picked={side === 'away'}
            pending={busy === 'away'}
            disabled={state !== 'open' || writing}
            onPick={() => onPick('away')}
          />
          <span
            className="flex shrink-0 flex-col items-center px-0.5 font-heading text-[13px] font-bold uppercase tracking-[0.18em] text-stone-400"
            aria-hidden
          >
            <span>vs</span>
          </span>
          <TeamSide
            side="home"
            club={home}
            reward={homeReward}
            outcome={outcome}
            picked={side === 'home'}
            pending={busy === 'home'}
            disabled={state !== 'open' || writing}
            onPick={() => onPick('home')}
          />
          <PickSlot picked={side === 'home'} pending={busy === 'home'} outcome={outcome} />
        </div>

        {/* A `min-w` rather than a fixed `w`: the lock icon plus `7:00 pm ET`
         * needs 100px, and wrapping the zone onto its own line reads as a
         * broken row. The column takes that width only on the rows that need
         * it, and every cell is right-aligned, so the edges stay flush. */}
        <div className="flex min-w-[5.5rem] shrink-0 flex-col items-end text-right sm:min-w-[7rem]">
          <p className="flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold leading-tight text-brand-ink">
            {state === 'live' ? (
              <LiveBadge>{game.status || 'Live'}</LiveBadge>
            ) : (
              <>
                {state === 'locked' && <Lock className="h-3.5 w-3.5 text-stone-400" aria-hidden />}
                {statusPrimary(state, game)}
              </>
            )}
          </p>
          {state === 'picked' ? (
            <button
              type="button"
              onClick={onClear}
              disabled={writing}
              className="text-[12px] font-semibold text-brand-orange underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              {busy === 'clear' ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Removing
                </span>
              ) : (
                'Undo pick'
              )}
            </button>
          ) : (
            <p className="text-[12px] leading-tight text-stone-500">
              {statusSecondary(state, game)}
            </p>
          )}
        </div>
      </div>

      {/* A game with no line yet says so on its own line rather than in the
       * gutter: a caption under the `vs` widened the divider and squeezed the
       * team names down to `M…`. A game past tip-off has no line to wait for,
       * so it stays quiet. */}
      {!locked && state !== 'settled' && !awayReward && !homeReward && (
        <p className="mt-0.5 text-center text-[11px] font-medium text-stone-400">
          No line posted yet — points land once the book does
        </p>
      )}
    </li>
  );
}

function TeamSide({
  side,
  club,
  reward,
  outcome,
  picked,
  pending,
  disabled,
  onPick,
}: {
  side: PickSide;
  club: Club;
  reward: Reward | null;
  outcome: Outcome;
  picked: boolean;
  /** This side's pick is being written; the tap is acknowledged, not confirmed. */
  pending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  // Away mirrors home around the `vs`: both logos sit next to the divider, so
  // the pair reads as one matchup instead of two columns with a hole between.
  const away = side === 'away';
  const label = reward
    ? outcome
      ? `${club.name} — ${reward.label}, pick ${outcome === 'hit' ? 'came in' : 'missed'}`
      : `${club.name} — ${reward.label} if correct`
    : `Pick ${club.name}`;

  /* The picked side carries a tint, inset from the row's rules so it reads as a
   * selected cell rather than a band across the card. Once the pick is judged
   * the tint takes the verdict's colour, so a settled row says right or wrong
   * before the tick is read. The padding is always there — only the fill
   * changes — so a pick landing never nudges the logo or the mark beside it.
   *
   * A side being written wears the same neutral wash as a landed pick, so the
   * tap feels acknowledged while the round trip is still out. */
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={picked}
      aria-busy={pending}
      aria-label={label}
      className={`flex w-full min-w-0 items-center justify-center gap-2 rounded-lg px-1 py-1 transition-colors sm:px-2.5 sm:py-1.5 ${
        away ? 'flex-row-reverse' : ''
      } ${picked || pending ? pickTint(outcome) : disabled ? 'cursor-default' : 'hover:bg-brand-cream'}`}
    >
      <span className="shrink-0">
        {/* Below `sm` the side prints the tricode itself, so a fallback code
         * here would print it twice (`MEM MEM`) when the CDN fails. */}
        <TeamMark club={club} size={34} fallbackClassName="hidden sm:flex" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-center justify-center gap-1 text-center text-[15px] leading-tight ${
            picked ? 'font-semibold text-brand-navyDark' : 'font-medium text-brand-ink'
          }`}
        >
          {/* Below `sm` the full club name has no room beside the logo and the
           * points, so the side wears its tricode instead — same team, four
           * characters, and the logo already carries the colours. */}
          <span className="truncate sm:hidden">{club.abbreviation}</span>
          <span className="hidden truncate sm:block">{club.name}</span>
        </span>
        <span
          className={`flex items-baseline justify-center gap-1 text-center text-[12px] leading-tight text-stone-500`}
        >
          {/* Below `sm` the row is too narrow for the record and the reward at
           * once; the reward is what the reader is deciding on, so the record
           * steps aside rather than squeezing the points into an ellipsis. */}
          <span className="hidden truncate sm:inline">{club.record ?? club.abbreviation}</span>
          {reward && (
            <>
              <span className="hidden sm:inline" aria-hidden>
                ·
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${reward.tone}`}>
                {reward.label}
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * The mark on the picked side, in a slot that is always present.
 *
 * The slot sits inside the matchup column, as its first and last child, so an
 * away pick marks the left edge of the column and a home pick the right edge:
 * mirror images, both right beside the name they are for. The slot is always
 * there, filled or not, so a pick landing never shifts the team names.
 *
 * While that side's pick is being written the slot spins instead of filling:
 * the tick is the confirmation, so it must not appear before the API says so.
 * The spinner is the mark's own 16px, so nothing moves when it resolves.
 */
function PickSlot({
  picked,
  pending,
  outcome,
}: {
  picked: boolean;
  pending: boolean;
  outcome: Outcome;
}) {
  return (
    <span className="flex w-4 shrink-0 items-center justify-center">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-brand-navy" aria-hidden />
      ) : (
        picked && (
          <PickMark
            outcome={outcome}
            className={`h-4 w-4 rounded-full p-[2px] text-white ${checkTone(outcome)}`}
          />
        )
      )}
    </span>
  );
}

/* ── Copy ──────────────────────────────────────────────────────
 * Points, never prices. The feed's decimal is a bookmaker's number and stays on
 * the server; what lands here is what the pick pays. Before a line exists there
 * is nothing honest to promise, so the side says the line is pending instead of
 * inventing a number.
 *
 * Each side carries its own reward, printed next to the team it belongs to. A
 * single "25 pts, or 17 the other way" block on the right made the reader work
 * out which number went with which team, which is the one thing this row must
 * never make you guess.
 */

const POINTS_SCALE = 10;
const POINTS_CEILING = 150;

function pointsFrom(decimal: number | null | undefined): number | null {
  if (decimal == null) return null;
  return Math.min(Math.round(POINTS_SCALE * decimal), POINTS_CEILING);
}

interface Reward {
  label: string;
  tone: string;
}

function sideReward(
  state: RowState,
  odds: OddsPreview | null,
  weighted: Pick | null,
  settled: Pick | null,
  side: PickSide,
): Reward | null {
  if (state === 'settled') {
    // Only the side that was actually picked has a result to report. Green for a
    // hit and the palette's red for a miss: the verdict lives on the team you
    // backed, so a final row is read in one glance instead of two comparisons.
    if (!settled || settled.side !== side) return null;
    const points = settled.points;
    if (points === null) return { label: 'pending', tone: 'text-stone-400' };
    return {
      label: formatPoints(points),
      tone: points > 0 ? 'text-brand-green' : 'text-brand-red',
    };
  }

  if (state === 'locked' || state === 'live') {
    // At tip-off only the picked side has a locked price; the other is closed.
    if (weighted?.side !== side) return null;
    const locked = pointsFrom(weighted?.lockedDecimal);
    return locked === null
      ? { label: 'pending', tone: 'text-stone-400' }
      : { label: formatPoints(locked), tone: 'text-brand-navyDark' };
  }

  // A pick already carries the price it was made at; a later line must not
  // rewrite what this player is actually playing for.
  if (weighted?.side === side) {
    const locked = pointsFrom(weighted.lockedDecimal);
    if (locked !== null) return { label: formatPoints(locked), tone: 'text-brand-navyDark' };
    if (weighted.pendingPrice) return { label: 'pending', tone: 'text-stone-400' };
  }

  // Both sides read at the same weight: the check mark says which one is the
  // pick, so a second, quieter signal would just look like an accident.
  const priced = odds?.available ? (side === 'home' ? odds.home : odds.away) : null;
  const points = pointsFrom(priced?.decimal);
  return points === null ? null : { label: formatPoints(points), tone: 'text-brand-navyDark' };
}

function statusPrimary(state: RowState, game: Game): string {
  if (state === 'settled') return 'Final';
  return game.status || formatTimeET(game.gameDateTime);
}

function statusSecondary(state: RowState, game: Game): string {
  const score =
    game.homeScore != null && game.awayScore != null ? `${game.awayScore}–${game.homeScore}` : null;

  if (state === 'live') return score ?? 'in play';
  if (state === 'settled') return score ?? 'no score';
  if (state === 'locked') return 'locked';
  return relativeToTipoff(game.gameDateTime);
}

/**
 * A live game has to look live from across the room: the ring pulses, and the
 * clock rides along in the same red so the row cannot be mistaken for a final.
 * The score sits underneath, where a final puts its score.
 */
function LiveBadge({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-brand-red">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-red" />
      </span>
      {children}
    </span>
  );
}

/** Green when the pick came in, the palette's red when it did not, navy before
 * there is a verdict — the mark keeps its meaning in all three states. */
function checkTone(outcome: Outcome): string {
  if (outcome === 'hit') return 'bg-brand-green';
  if (outcome === 'miss') return 'bg-brand-red';
  return 'bg-brand-navy';
}

/**
 * The picked cell's fill. Weak enough that the names keep their contrast, but
 * a settled row reads green or red across the whole side before you find the
 * tick — the verdict is the first thing a finished row should say.
 */
function pickTint(outcome: Outcome): string {
  if (outcome === 'hit') return 'bg-brand-green/[0.1]';
  if (outcome === 'miss') return 'bg-brand-red/[0.09]';
  return 'bg-brand-navy/[0.07]';
}

/**
 * The mark on the backed team. A settled miss swaps the tick for an X: a red
 * tick still reads as "correct, in red", which is the one thing it must not.
 */
function PickMark({ outcome, className }: { outcome: Outcome; className: string }) {
  if (outcome === 'miss') return <X className={className} aria-hidden />;
  return <Check className={className} aria-hidden />;
}
