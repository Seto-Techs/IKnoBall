import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { CalendarClock, Target, Trophy, TrendingUp, UserRound, Zap } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { EmptyState, Panel } from '../components/dashboard/shared';
import { StatCard } from '../components/dashboard/StatCard';
import {
  useLeaderboard,
  useMyPicks,
  useTeamRecord,
  useTeams,
  useTopPlayers,
  type PredictionMode,
  type PredictionPickWithGame,
} from '../lib/api';
import { buildTeamLookup, canonicalAbbr } from '../lib/game-utils';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

/** 1 -> "1st", 12 -> "12th", 23 -> "23rd". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function ProfilePage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const favTeam = user?.favoriteTeam ?? null;
  const { data: teams } = useTeams({ enabled: !!user });
  const team = favTeam ? (teams?.find((t) => t.abbreviation === favTeam) ?? null) : null;
  const accentColor = team?.primaryColor ?? '#1C4188';

  const { data: record } = useTeamRecord(favTeam ?? undefined);
  const { data: players } = useTopPlayers(favTeam ?? undefined);

  const { data: myPicks } = useMyPicks();
  // Must run before the early returns below, or the hook count changes between
  // renders and React throws "Rendered more hooks than during the previous render".
  const lookup = useMemo(() => buildTeamLookup(teams), [teams]);

  const flatBoard = useLeaderboard('flat');
  const weightedBoard = useLeaderboard('weighted');

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user || !team) return null;

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  // The picks endpoint already carries the game, so history does not depend on
  // fetching a schedule window. Open picks sort first, then by tip-off; each
  // mode is its own row so the list can show that mode's payout.
  const historyEntries = [...(myPicks ?? [])].sort((a, b) => {
    const sa = a.gameStatus === 1 ? 0 : 1;
    const sb = b.gameStatus === 1 ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return new Date(a.gameDateTime ?? 0).getTime() - new Date(b.gameDateTime ?? 0).getTime();
  });

  // One pick writes a flat row and a weighted row, so group by game: the list
  // shows each game once carrying both payouts, and the counts below are per
  // pick rather than per row.
  const rowsByGame = new Map<string, PredictionPickWithGame[]>();
  for (const pick of historyEntries) {
    const rows = rowsByGame.get(pick.gameId);
    if (rows) rows.push(pick);
    else rowsByGame.set(pick.gameId, [pick]);
  }
  const gameRows = [...rowsByGame.values()];

  const openPicks = gameRows.filter(([pick]) => pick.gameStatus === 1);
  const settledEntries = gameRows.filter(([pick]) => pick.status === 'settled');
  const correctCount = settledEntries.filter(([pick]) => (pick.points ?? 0) > 0).length;
  const wrongCount = settledEntries.length - correctCount;
  // Points are the one figure that is per mode, so it deliberately sums both.
  const totalPoints = historyEntries.reduce((sum, pick) => sum + (pick.points ?? 0), 0);
  const accuracy = settledEntries.length
    ? `${Math.round((correctCount / settledEntries.length) * 100)}%`
    : '—';

  // Two boards exist, so rank against whichever one places the user highest and
  // name it, rather than showing "—" for someone ranked only in the other mode.
  const myFlatRow = flatBoard.data?.find((row) => row.userId === user.id) ?? null;
  const myWeightedRow = weightedBoard.data?.find((row) => row.userId === user.id) ?? null;
  const bestRow =
    [...[myFlatRow, myWeightedRow]]
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.rank - b.rank)[0] ?? null;
  const rankLabel = bestRow ? `${bestRow.rank}${ordinal(bestRow.rank)}` : '—';
  const rankCaption = bestRow
    ? `${bestRow === myFlatRow ? 'Flat' : 'Weighted'} leaderboard`
    : 'No settled picks';

  const initials = (user.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader
        userName={user.name}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="profile"
      />

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6">
          {/* ── Profile header ── */}
          <div
            className="relative overflow-hidden rounded-xl border border-brand-line shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 23px, white 23px, white 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, white 23px, white 24px)',
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:gap-6 sm:px-8">
              <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white/95 font-heading text-4xl font-black uppercase text-brand-navy shadow-xl ring-4 ring-white/30">
                {initials || <UserRound className="h-10 w-10" aria-hidden="true" />}
              </span>
              <div className="min-w-0 text-center sm:text-left">
                <h1 className="font-heading text-4xl font-black uppercase tracking-wide text-white">
                  {user.name}
                </h1>
                <p className="mt-0.5 text-sm text-white/80">{user.email}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
                    {team.logoUrl && (
                      <img src={team.logoUrl} alt="" className="h-4 w-4 object-contain" />
                    )}
                    {team.teamName} · {team.abbreviation}
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
                    {team.conference === 'East' ? 'Eastern' : 'Western'} · {team.division}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    Member since {new Date(user.createdAt).getFullYear() || '2026'}
                  </span>
                </div>
              </div>
              <Link
                to="/onboarding"
                className="shrink-0 rounded-md border border-white/30 bg-white/10 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur transition hover:bg-white/20 sm:ml-auto"
              >
                Change Team
              </Link>
            </div>
          </div>

          {/* ── Top row: stats + team ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
                <StatCard
                  icon={<Trophy className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Rank"
                  value={rankLabel}
                  caption={rankCaption}
                />
                <StatCard
                  icon={<Target className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Accuracy"
                  value={accuracy}
                  caption="Settled picks"
                />
                <StatCard
                  icon={<TrendingUp className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Predictions"
                  value={`${correctCount}W ${wrongCount}L`}
                  caption="Correct / Wrong"
                />
                <StatCard
                  icon={<Zap className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
                  label="Points"
                  value={String(totalPoints)}
                  caption="All modes"
                />
              </div>

              <Panel title="My Predictions" clip contentClassName="!p-0">
                <div className="flex items-center justify-end border-b border-brand-line px-5 py-2">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-stone-500">
                    {openPicks.length} open · {gameRows.length} total
                  </span>
                </div>
                <div className="divide-y divide-brand-line">
                  {gameRows.length === 0 && (
                    <EmptyState message="No predictions yet — make your first pick from the Predictions page." />
                  )}
                  {gameRows.map((rows) => (
                    <HistoryRow
                      key={rows[0].gameId}
                      rows={rows}
                      lookup={lookup}
                      accentColor={accentColor}
                    />
                  ))}
                </div>
                {gameRows.length > 0 && (
                  <div className="border-t border-brand-line px-5 py-3 text-center">
                    <Link
                      to="/predict"
                      className="text-sm font-bold uppercase tracking-widest text-brand-navy underline-offset-2 hover:underline"
                    >
                      View all games →
                    </Link>
                  </div>
                )}
              </Panel>
            </div>

            <aside className="min-w-0">
              <Panel title={team.teamName} clip contentClassName="!p-0">
                <div
                  className="flex items-center gap-4 px-5 py-4"
                  style={{ backgroundColor: team.primaryColor }}
                >
                  {team.logoUrl && (
                    <img
                      src={team.logoUrl}
                      alt={team.fullName}
                      className="h-16 w-16 object-contain drop-shadow"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 text-white">
                    <p className="truncate font-heading text-xl font-black uppercase tracking-wide">
                      {team.fullName}
                    </p>
                    <p className="text-xs text-white/75">
                      {team.conference === 'East' ? 'Eastern' : 'Western'} Conference ·{' '}
                      {team.division}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 px-5 py-4">
                  <div>
                    <p className="font-heading text-3xl font-black tabular-nums text-brand-ink">
                      {record ? `${record.wins}-${record.losses}` : '—'}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Record
                    </p>
                  </div>
                  <div>
                    <p className="font-heading text-3xl font-black tabular-nums text-brand-ink">
                      {players?.[0]?.points.toFixed(1) ?? '—'}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Top PPG
                    </p>
                  </div>
                  <div>
                    <p className="truncate text-sm font-semibold text-brand-ink">
                      {team.headCoach}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Head Coach
                    </p>
                  </div>
                  <div>
                    <p className="truncate text-sm font-semibold text-brand-ink">{team.arena}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Arena
                    </p>
                  </div>
                </div>
              </Panel>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Flat before weighted — the order a pick's two rows are written in. */
const MODE_ORDER: Record<PredictionMode, number> = { flat: 0, weighted: 1 };

const POINTS_SCALE = 10;
const POINTS_CEILING = 150;

/**
 * What a mode pays if the pick lands: flat always 1, weighted the locked price
 * on the same scale the server settles with. Null when a weighted pick has no
 * price locked yet.
 *
 * Mirrors `potentialPoints` in `@iknoball/predictions`. The frontend does not
 * depend on that package — the image build never compiles it — so the two have
 * to be kept in step by hand. Settlement stays authoritative either way; this
 * only feeds the preview.
 */
function wouldBePoints(mode: PredictionMode, lockedDecimal: number | null): number | null {
  if (mode === 'flat') return 1;
  if (lockedDecimal === null) return null;
  return Math.min(Math.round(POINTS_SCALE * lockedDecimal), POINTS_CEILING);
}

/**
 * One mode's payout for a pick.
 *
 * Settled and correct shows what it scored; missed shows what it would have
 * scored, struck through; anything still open shows the same figure dimmed,
 * because the price can still move before it settles.
 */
function ModeChip({ row }: { row: PredictionPickWithGame }) {
  const settled = row.status === 'settled';
  const missed = settled && (row.points ?? 0) === 0;
  const value =
    row.status === 'voided'
      ? null
      : settled && !missed
        ? row.points
        : wouldBePoints(row.mode, row.lockedDecimal);

  return (
    <span
      className={`rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-stone-500 ${
        settled ? '' : 'opacity-60'
      }`}
    >
      {row.mode === 'flat' ? 'Flat' : 'Weighted'}
      <span
        className={`ml-1 tabular-nums text-brand-ink ${
          missed ? 'line-through decoration-brand-red decoration-2' : ''
        }`}
      >
        {value ?? '—'}
      </span>
    </span>
  );
}

function HistoryRow({
  rows,
  lookup,
  accentColor,
}: {
  /** Every mode held on one game. Both always name the same side. */
  rows: PredictionPickWithGame[];
  lookup: ReturnType<typeof buildTeamLookup>;
  accentColor: string;
}) {
  const [pick] = rows;
  const awayAbbr = pick.awayTricode ?? (pick.awayTeam ?? '?').slice(0, 3).toUpperCase();
  const homeAbbr = pick.homeTricode ?? (pick.homeTeam ?? '?').slice(0, 3).toUpperCase();
  const away = lookup.byKey.get(canonicalAbbr(awayAbbr)) ?? null;
  const home = lookup.byKey.get(canonicalAbbr(homeAbbr)) ?? null;
  const picked = pick.side === 'away' ? awayAbbr : homeAbbr;
  const modes = [...rows].sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode]);

  // Status comes from the server, which is authoritative: it knows about voided
  // games and about picks settled after the line moved. Both modes share a side
  // and settle in the same pass, so one verdict covers the whole pick.
  let resultLabel: string;
  if (pick.status === 'voided') {
    resultLabel = 'Void';
  } else if (pick.status === 'settled') {
    resultLabel = (pick.points ?? 0) > 0 ? '✓ Correct' : '✗ Missed';
  } else if (pick.gameStatus === 1) {
    resultLabel = 'Open';
  } else {
    resultLabel = 'Pending';
  }

  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: pick.gameId }}
      className="flex flex-col gap-2 px-5 py-3 transition hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {away?.logoUrl ? (
          <img src={away.logoUrl} alt="" className="h-5 w-5 object-contain" loading="lazy" />
        ) : null}
        <span className="text-sm font-bold text-brand-ink">{awayAbbr}</span>
        <span className="text-stone-400">@</span>
        {home?.logoUrl ? (
          <img src={home.logoUrl} alt="" className="h-5 w-5 object-contain" loading="lazy" />
        ) : null}
        <span className="text-sm font-bold text-brand-ink">{homeAbbr}</span>
        <span className="ml-2 hidden truncate text-xs text-stone-500 sm:inline">
          {new Date(pick.gameDateTime ?? 0).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-stone-600">
          {picked}
        </span>
        {/* One chip per mode, so both payouts for this pick stay visible. */}
        <span className="flex shrink-0 items-center gap-1">
          {modes.map((row) => (
            <ModeChip key={row.mode} row={row} />
          ))}
        </span>
        <span
          className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-black uppercase tracking-widest ${
            resultLabel === '✓ Correct'
              ? 'bg-emerald-500/15 text-emerald-700'
              : resultLabel === 'Open'
                ? 'bg-brand-navy/10 text-brand-navy'
                : resultLabel === '✗ Missed'
                  ? 'bg-brand-red/10 text-brand-red'
                  : 'bg-stone-100 text-stone-500'
          }`}
        >
          {resultLabel}
        </span>
        <span
          className="hidden h-2 w-2 shrink-0 rounded-full sm:block"
          style={{ backgroundColor: accentColor }}
        />
      </div>
    </Link>
  );
}
