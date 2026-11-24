import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Flame, Link2, Sparkles, Target } from 'lucide-react';
import {
  fetchLeaderboard,
  fetchPicks,
  fetchSlate,
  fetchTeams,
  useResource,
  type Game,
  type LeaderboardRow,
  type Me,
  type PredictionMode,
} from '../lib/api';
import {
  etDateKey,
  formatDateLabel,
  formatPoints,
  formatTimeET,
  shiftEtDate,
} from '../lib/game-utils';
import { fetchLebronnectMe, fetchPuzzle, headshotUrl, playerLabel } from '../lib/lebronnect';
import { Avatar, ErrorNote, Skeleton, TeamMark } from '../components/kit';
import { ScoreMeter, gradeLabel } from '../components/connect/parts';
import { buildClubIndex, resolveClub, type ClubIndex } from '../lib/teams';
import type { Screen } from '../lib/nav';

/**
 * The launch screen: where tonight stands, and the doors into the app.
 *
 * The page is read top to bottom as one question — how much is there to do, and
 * have I done it — so the hero carries the slate and the viewer's own numbers,
 * and each door previews what is behind it rather than describing it. A card
 * that only says "Predictions" makes the player open it to find out whether they
 * still owe picks; a card that shows three of tonight's games does not.
 *
 * The doors get equal columns: one when there is no room, two when there is,
 * three once a third card can hold its own width. The third card is a game that
 * has not opened yet, so below three-up it stops being a column and becomes a
 * clause in the footer line — it says nothing a player can act on, and a dead
 * card is worse than a sentence.
 *
 * The previews inside the cards are gated on height rather than width: a
 * mobile-landscape Discord window is about 390px tall, and there the cards keep
 * their title and their button and drop the decoration.
 */

/** Where a preview stops being decoration and starts competing with the button. */
const PREVIEW = 'hidden [@media(min-height:560px)]:block';

/**
 * Both modes, both scopes, in one read.
 *
 * The hero states four numbers, so they arrive together: four separate resources
 * would let one chip appear after another and shove the row wider while the
 * player is looking at it.
 *
 * The server reads fail soft. They are the narrower scope — a guild the bot has
 * not mirrored, or a preview with no guild at all — and losing one should cost
 * that server rank, not the global ranks and points beside it.
 */
type Ranks = Record<PredictionMode, { server: LeaderboardRow[]; global: LeaderboardRow[] }>;

function loadRanks(): Promise<Ranks> {
  const server = (mode: PredictionMode) =>
    fetchLeaderboard(mode, 'server').catch(() => [] as LeaderboardRow[]);

  return Promise.all([
    fetchLeaderboard('flat', 'global'),
    server('flat'),
    fetchLeaderboard('weighted', 'global'),
    server('weighted'),
  ]).then(([flatGlobal, flatServer, weightedGlobal, weightedServer]) => ({
    flat: { global: flatGlobal, server: flatServer },
    weighted: { global: weightedGlobal, server: weightedServer },
  }));
}

/** The viewer's row on one board, or null when it has nothing scored for them. */
function mine(rows: LeaderboardRow[] | undefined, userId: string): LeaderboardRow | null {
  return rows?.find((row) => row.userId === userId) ?? null;
}

export function Home({ me, onOpen }: { me: Me; onOpen: (screen: Screen) => void }) {
  const tomorrow = shiftEtDate(1);
  const yesterday = shiftEtDate(-1);
  const slate = useResource(() => fetchSlate(tomorrow), tomorrow);
  const picks = useResource(fetchPicks);
  const puzzle = useResource(fetchPuzzle);
  const lebronnect = useResource(fetchLebronnectMe);
  const ranks = useResource(loadRanks);
  const teams = useResource(fetchTeams);

  const index = buildClubIndex(teams.data);

  // Earliest tip first: the list is a schedule, and a schedule that is not in
  // time order is just a set of games.
  const games = [...(slate.data ?? [])].sort(
    (a, b) => new Date(a.gameDateTime).getTime() - new Date(b.gameDateTime).getTime(),
  );

  const pickedIds = new Set((picks.data ?? []).map((pick) => pick.gameId));
  const picked = games.filter((game) => pickedIds.has(game.id)).length;

  const count = slate.data ? games.length : null;
  // Whether anything is picked is a claim about the viewer, so it is only made
  // once their picks have actually arrived. A page that says "nothing picked"
  // while it is still asking is telling the player something false.
  const picksKnown = picks.data !== undefined;
  const solved = lebronnect.data?.result ?? null;
  const streak = lebronnect.data?.stats.streak ?? 0;

  // A server segment is offered only when the server board actually has someone
  // on it. A DM launch has no guild at all, and a guild the bot has not mirrored
  // has nobody to rank — in both cases a server rank would be a dash claiming a
  // board that does not exist.
  const hasServer = (ranks.data?.flat.server.length ?? 0) > 0;

  // Four ranks: each mode, in each scope. They are read together so the hero
  // never shows one and then grows another.
  const flat = {
    server: mine(ranks.data?.flat.server, me.id),
    global: mine(ranks.data?.flat.global, me.id),
  };
  const weighted = {
    server: mine(ranks.data?.weighted.server, me.id),
    global: mine(ranks.data?.weighted.global, me.id),
  };

  // Yesterday, from the picks already in hand: the flat board's settled calls on
  // games that belong to yesterday in ET. Voided and still-pending picks are not
  // a record — a postponement neither helped nor hurt, so it is not counted.
  const yesterdayDone = (picks.data ?? []).filter(
    (pick) =>
      pick.mode === 'flat' &&
      pick.status === 'settled' &&
      pick.gameDateTime !== null &&
      etDateKey(new Date(pick.gameDateTime)) === yesterday,
  );
  const yesterdayRight = yesterdayDone.filter((pick) => (pick.points ?? 0) > 0).length;
  const yesterdayPoints = yesterdayDone.reduce((sum, pick) => sum + (pick.points ?? 0), 0);

  const firstTip = games[0]?.gameDateTime ?? null;

  const headline =
    count === null
      ? 'Tomorrow’s slate'
      : count === 0
        ? 'No games tomorrow'
        : `${count} ${count === 1 ? 'game' : 'games'} to call`;

  const subline =
    count === null
      ? 'Loading the schedule.'
      : count === 0
        ? 'The schedule lands here once the league posts it.'
        : !picksKnown
          ? 'Checking your picks.'
          : picked === 0
            ? 'Nothing picked yet — the whole slate is open.'
            : picked >= count
              ? 'Every game called. Good luck.'
              : `${picked} of ${count} picked · ${count - picked} still open`;

  const failed = slate.error ?? picks.error ?? puzzle.error ?? ranks.error;

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
      {/* The stack centres in the window when there is room and scrolls when
          there is not, rather than stretching two cards to fill a tall window
          and leaving a hole above their buttons. */}
      <div className="my-auto flex flex-col gap-2 [@media(min-height:560px)]:gap-3">
        <section className="rounded-xl bg-brand-navyDark px-4 py-3.5 text-white [@media(max-height:559px)]:py-2.5 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                Tomorrow · {formatDateLabel(tomorrow)}
              </p>
              <h1 className="mt-1.5 font-heading text-[28px] font-semibold uppercase leading-none tracking-[0.02em] [@media(max-height:559px)]:text-[24px] sm:text-[32px]">
                {headline}
              </h1>
              {/* At a mobile-landscape height the hero gives up its second line:
                  the cards below already state the same count, and the window is
                  only ~390px tall, so the hero's job there is to say which night
                  it is and get out of the way. */}
              <p className="mt-2 hidden text-[13px] font-medium leading-snug text-white/70 [@media(min-height:560px)]:block">
                {subline}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {ranks.data && (
                <>
                  {/* One chip per mode, each carrying both scopes: the same
                      player sits at a different rank on every one of the four
                      boards, so a single "your rank" would be three-quarters
                      false. */}
                  <RankChip mode="Flat" ranks={flat} hasServer={hasServer} />
                  <RankChip mode="Weighted" ranks={weighted} hasServer={hasServer} />
                </>
              )}
            </div>
          </div>
        </section>

        {/* The doors are peers, so they get equal columns: one when there is no
            room, two when there is, three once a third card can hold its own
            width. Below three-up the coming-soon door is not worth a column —
            it says nothing the player can act on — so it drops to the footer
            line instead of disappearing. */}
        <div className="grid gap-3 sm:grid-cols-2 [@media(min-width:1000px)]:grid-cols-3">
          <Door
            tone="light"
            icon={<Target className="h-5 w-5 text-brand-navy" aria-hidden />}
            title="Predictions"
            aside={
              count === null ? (
                'Tomorrow'
              ) : (
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  <span>{`${count} ${count === 1 ? 'game' : 'games'}`}</span>
                  {firstTip && (
                    <span className="font-semibold text-stone-400">
                      · <Countdown to={firstTip} />
                    </span>
                  )}
                </span>
              )
            }
            note={
              count === null || !picksKnown || picked === 0
                ? 'Call the winner before tip-off. Right calls pay points.'
                : `${picked} of ${count} called. The rest close at tip-off.`
            }
            cta={
              !picksKnown || picked === 0
                ? 'Make picks'
                : picked >= (count ?? 0)
                  ? 'Review picks'
                  : 'Finish picks'
            }
            onOpen={() => onOpen('predictions')}
            preview={
              slate.data === undefined && !slate.error ? (
                /* The schedule is on its way. Three rows of the same height it
                   will have, so the card does not grow and shove the page. */
                <ul className="divide-y divide-brand-line">
                  {[0, 1, 2].map((row) => (
                    <SlateRowSkeleton key={row} />
                  ))}
                </ul>
              ) : games.length > 0 ? (
                <ul className="divide-y divide-brand-line">
                  {games.slice(0, 3).map((game) => (
                    <SlateRow
                      key={game.id}
                      game={game}
                      index={index}
                      picked={pickedIds.has(game.id)}
                    />
                  ))}
                </ul>
              ) : null
            }
            more={
              slate.data === undefined && !slate.error ? (
                /* The line that counts the rest of the slate. It is part of the
                   card's height, so it waits as a placeholder rather than
                   arriving late and pushing the row down. */
                <Skeleton className="h-3 w-32 rounded bg-stone-200" />
              ) : games.length > 3 ? (
                `+${games.length - 3} more on the slate`
              ) : null
            }
            footer={
              /* Yesterday's record, once the league has settled it. Nothing to
                 report before the first result lands, so the block stays out. */
              yesterdayDone.length > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                    Yesterday
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums text-brand-ink">
                    {`${yesterdayRight} of ${yesterdayDone.length} right`}
                    {yesterdayPoints > 0 && (
                      <span className="ml-1.5 font-medium text-stone-400">
                        {formatPoints(yesterdayPoints)}
                      </span>
                    )}
                  </span>
                </div>
              ) : null
            }
          />

          <Door
            tone="dark"
            icon={<Link2 className="h-5 w-5 text-white" aria-hidden />}
            title="Lebronnect"
            aside={puzzle.data ? `Board #${puzzle.data.number}` : 'Today’s board'}
            badge={
              /* The streak is the one number that survives a reset, so it sits
                 in the corner of the card rather than in the block below,
                 which now only ever reports today. */
              streak > 0 ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-brand-red px-2 py-1 text-white"
                  title={`${streak} ${streak === 1 ? 'day' : 'days'} in a row`}
                >
                  <Flame className="h-3.5 w-3.5 text-brand-gold" aria-hidden />
                  <span className="font-heading text-[13px] font-semibold leading-none tabular-nums">
                    {streak}
                  </span>
                  <span className="font-heading text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-white/80">
                    {streak === 1 ? 'day' : 'days'}
                  </span>
                </span>
              ) : null
            }
            note={
              solved
                ? 'Your chain is in. A new board drops at midnight ET.'
                : 'Link today’s two players through the teammates between them.'
            }
            cta={solved ? 'See today’s result' : 'Play'}
            onOpen={() => onOpen('lebronnect')}
            preview={
              puzzle.data ? (
                <div className="flex items-start justify-center gap-2">
                  <Face
                    name={puzzle.data.start.name}
                    image={headshotUrl(puzzle.data.start.externalId, '260x190')}
                    ring="ring-white/40"
                  />
                  <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-brand-orange" aria-hidden />
                  <Face
                    name={puzzle.data.target.name}
                    image={headshotUrl(puzzle.data.target.externalId, '260x190')}
                    ring="ring-basketball-400"
                  />
                </div>
              ) : puzzle.error ? null : (
                /* The board is still being dealt. Two faces' worth of space,
                   held open, so the pair fades in rather than dropping in. */
                <div className="flex items-start justify-center gap-2">
                  <FaceSkeleton />
                  <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-brand-orange" aria-hidden />
                  <FaceSkeleton />
                </div>
              )
            }
            footer={
              /* The block under the note is about today only: the streak moved
                 to the header, and the season numbers are what the result
                 screen is for. Before you have played it shows five empty
                 boxes, which is the honest picture of today's record. */
              lebronnect.data ? (
                <div className="flex items-center justify-between gap-3">
                  <ScoreMeter
                    rating={solved?.blocks ?? 0}
                    label={
                      solved ? `Today: ${gradeLabel(solved.players, solved.par)}` : 'Not played yet'
                    }
                  />
                  {/* Your count and the floor's, the same pair the result screen
                      prints — the grade above already says whether it was good. */}
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    {solved
                      ? `${playerLabel(solved.players)} · best ${playerLabel(solved.par)}`
                      : 'Not played yet'}
                  </span>
                </div>
              ) : lebronnect.error ? null : (
                /* Your record for today, not yet known. Five empty boxes are
                   what an unplayed day looks like too, so the shape is honest
                   either way — only the words would be a guess. */
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <Skeleton key={step} className="h-3.5 w-3.5 rounded-[3px] bg-white/10" />
                    ))}
                  </div>
                  <Skeleton className="h-[17px] w-24 rounded bg-white/10" />
                </div>
              )
            }
          />

          <ComingSoon />
        </div>

        {failed && <ErrorNote message={failed} />}

        <p className="text-center text-[12px] leading-relaxed text-stone-500">
          Picks lock at tip-off · Lebronnect resets at midnight ET
          {/* Below three-up the coming-soon door has no column to sit in, so it
              becomes this clause. Same news, one line. */}
          <span className="[@media(min-width:1000px)]:hidden"> · Another game on the way</span>
        </p>
      </div>
    </div>
  );
}

/**
 * One number from the viewer's season, small enough to sit in the hero.
 *
 * The two runs are aligned on their baseline rather than their boxes: centred
 * boxes put the 14px value and the 10px label on different baselines, which the
 * descender in "pts" makes obvious — the label looks lifted.
 */
/**
 * One mode's two ranks: `#1 srv · #1 global` under a `FLAT · 13 PTS` caption.
 *
 * The scope labels are set in the label's small caps rather than beside the
 * numbers, because `#1 srv` and `#1 global` at the same size read as two ranks of
 * equal standing — which they are — and the number that matters first is the one
 * the player can still do something about, this server's.
 */
function RankChip({
  mode,
  ranks,
  hasServer,
}: {
  mode: string;
  ranks: { server: LeaderboardRow | null; global: LeaderboardRow | null };
  /** Whether this launch has a guild at all, which decides the server segment. */
  hasServer: boolean;
}) {
  const points = ranks.global?.points ?? ranks.server?.points ?? 0;

  return (
    <span className="flex flex-col gap-1 rounded-lg bg-white/10 px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-white/50">
        {mode} · {formatPoints(points)}
      </span>
      <span className="flex items-baseline gap-1 font-heading text-[14px] font-semibold leading-none tracking-[0.04em] text-white">
        {/* A DM launch has no server to rank, so the segment is left out rather
            than filled with a dash that would claim one. */}
        {hasServer && (
          <>
            <span>{rank(ranks.server)}</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/45">
              srv
            </span>
            <span className="text-white/25">·</span>
          </>
        )}
        <span>{rank(ranks.global)}</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/45">
          global
        </span>
      </span>
    </span>
  );
}

/** A rank, or a dash when that board has nothing scored for the viewer yet. */
function rank(row: LeaderboardRow | null): string {
  return row ? `#${row.rank}` : '—';
}

/** A door: what is inside, what state it is in, and the one action it offers. */
function Door({
  tone,
  icon,
  title,
  aside,
  badge,
  note,
  cta,
  preview,
  more,
  footer,
  onOpen,
}: {
  tone: 'light' | 'dark';
  icon: ReactNode;
  title: string;
  aside: ReactNode;
  badge?: ReactNode;
  note: string;
  cta: string;
  preview: ReactNode;
  more?: ReactNode;
  footer?: ReactNode;
  onOpen: () => void;
}) {
  const dark = tone === 'dark';

  return (
    <article
      className={`flex min-w-0 flex-1 flex-col rounded-xl border p-4 [@media(max-height:559px)]:p-3 sm:p-5 ${
        dark
          ? 'border-brand-navyDark bg-brand-navyDark text-white shadow-sm'
          : 'border-brand-line bg-white shadow-sm'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            dark ? 'bg-white/10' : 'bg-brand-navy/10'
          }`}
        >
          {icon}
        </span>
        <h2
          className={`min-w-0 truncate font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.03em] ${
            dark ? 'text-white' : 'text-brand-ink'
          }`}
        >
          {title}
        </h2>
        {/* A card's one standing number, when it has one: the streak lives
            here so the block below can stay about today. */}
        {badge && <div className="ml-auto shrink-0">{badge}</div>}
      </div>

      <p
        className={`mt-2.5 text-[13px] font-bold uppercase tracking-[0.12em] ${
          dark ? 'text-basketball-300' : 'text-brand-orange'
        }`}
      >
        {aside}
      </p>

      {preview && <div className={`mt-3 ${PREVIEW}`}>{preview}</div>}

      {more && <p className={`mt-1.5 ${PREVIEW} text-[11px] text-stone-400`}>{more}</p>}

      <p className={`mt-2.5 text-[14px] leading-snug ${dark ? 'text-white/70' : 'text-stone-600'}`}>
        {note}
      </p>

      {footer && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 ${PREVIEW} ${
            dark ? 'bg-white/[0.06]' : 'bg-stone-50'
          }`}
        >
          {footer}
        </div>
      )}

      {/* The button sits at the bottom of a card that is taller than its
          content, so equal-height cards line their actions up. In a narrow
          window the cards hug instead, and then the top margin collapses to
          zero — the padding keeps the note above from touching the button. */}
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={onOpen}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-heading text-[15px] font-semibold uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold ${
            dark
              ? 'bg-basketball-500 text-white hover:bg-basketball-600'
              : 'bg-brand-navy text-white hover:bg-brand-navyDark'
          }`}
        >
          {cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

/** A player's face over their name: the pair is the whole pitch of the game. */
function Face({ name, image, ring }: { name: string; image: string; ring: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <Avatar name={name} image={image} size={56} className={ring} />
      {/* Two lines held open: a name that wraps when it arrives would otherwise
          resize the card under the player's eye. */}
      <p className="min-h-[1.75rem] max-w-[5.5rem] text-center font-heading text-[12px] font-semibold uppercase leading-[1.15] tracking-wide text-white/80">
        {name}
      </p>
    </div>
  );
}

/** The same face, before the league has said whose it is. */
function FaceSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" aria-hidden>
      <Skeleton className="h-14 w-14 rounded-full bg-white/10" />
      <div className="flex h-7 w-full flex-col items-center justify-center gap-1">
        <Skeleton className="h-2 w-16 rounded bg-white/10" />
        <Skeleton className="h-2 w-11 rounded bg-white/10" />
      </div>
    </div>
  );
}

/**
 * The third door, still shut. It gets a card only where the row has width to
 * spare; below that the footer line carries the same news in one sentence.
 */
function ComingSoon() {
  return (
    <article className="hidden flex-col justify-center rounded-xl border border-dashed border-brand-line bg-white/60 p-4 [@media(min-width:1000px)]:flex sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy/5">
          <Sparkles className="h-5 w-5 text-brand-navy/40" aria-hidden />
        </span>
        <h2 className="min-w-0 truncate font-heading text-[26px] font-semibold uppercase leading-none tracking-[0.03em] text-stone-400">
          Coming soon
        </h2>
      </div>

      <p className="mt-2.5 text-[13px] font-bold uppercase tracking-[0.12em] text-stone-300">
        Next up
      </p>

      <p className="mt-2.5 text-[14px] leading-snug text-stone-500">
        A third game for the flat board. Nothing to play yet — we&rsquo;ll put it here when it
        opens.
      </p>
    </article>
  );
}

/**
 * The slate's opening tip, live. A countdown that is computed once and never
 * updated is wrong within the minute it is rendered, and an Activity can sit
 * open for hours, so the label owns its own clock: fifteen seconds is plenty for
 * a figure that only ever shows minutes.
 */
function Countdown({ to }: { to: string }) {
  const tip = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const left = tip - now;
  if (Number.isNaN(tip) || left <= 0) return null;

  const minutes = Math.floor(left / 60_000);
  const label =
    minutes < 60 ? `${Math.max(1, minutes)}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

  return <>first tip in {label}</>;
}

/**
 * One game of the slate, small: the marks, the codes, the tip, and whether it is
 * called.
 *
 * The mark and the code say different things — the logo is what a fan recognises
 * across a room, the code is what reads at a glance — so the row carries both
 * and the mark renders nothing when the CDN has no artwork, rather than falling
 * back to its own copy of the code.
 */
function SlateRow({ game, index, picked }: { game: Game; index: ClubIndex; picked: boolean }) {
  const away = resolveClub(index, game.awayTricode, game.awayTeam);
  const home = resolveClub(index, game.homeTricode, game.homeTeam);

  return (
    <li className="flex items-center gap-1.5 py-1.5">
      <TeamMark club={away} size={18} fallback={false} />
      <span className="font-heading text-[13px] font-semibold uppercase leading-none tracking-[0.06em] text-brand-ink">
        {away.abbreviation}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        v
      </span>
      <TeamMark club={home} size={18} fallback={false} />
      <span className="font-heading text-[13px] font-semibold uppercase leading-none tracking-[0.06em] text-brand-ink">
        {home.abbreviation}
      </span>
      <span className="ml-auto text-[11px] font-medium tabular-nums text-stone-400">
        {formatTimeET(game.gameDateTime)}
      </span>
      {picked ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-basketball-500" aria-label="Picked" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
    </li>
  );
}

/**
 * A slate row that has not arrived yet: the marks, the codes, the tip and the
 * picked tick, all at the width they will have. Only the widths are guesses —
 * a code is two or three letters — and the row's height is not, which is what
 * stops the card from growing under the player's eye.
 */
function SlateRowSkeleton() {
  return (
    <li className="flex items-center gap-1.5 py-1.5" aria-hidden>
      <Skeleton className="h-[18px] w-[18px] rounded bg-stone-200" />
      <Skeleton className="h-3 w-6 rounded bg-stone-200" />
      <span className="w-[10px]" />
      <Skeleton className="h-[18px] w-[18px] rounded bg-stone-200" />
      <Skeleton className="h-3 w-6 rounded bg-stone-200" />
      <Skeleton className="ml-auto h-3 w-11 rounded bg-stone-200" />
      <span className="h-3.5 w-3.5 shrink-0" />
    </li>
  );
}
