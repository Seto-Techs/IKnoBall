import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Sparkles } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { Panel } from '../components/dashboard/shared';
import { GameCard, type TeamRecord } from '../components/predict/GameCard';
import { rowsFromPicks } from '../components/predict/history';
import { MyPicksPanel } from '../components/predict/MyPicksPanel';
import { usePredictions } from '../components/predict/predictions';
import { SeasonMenu } from '../components/predict/SeasonMenu';
import {
  buildDaysFrom,
  formatSlateDayLabel,
  slateStats,
  type SlateDay,
  type SlateStats,
} from '../components/predict/slate';
import { WeekNavigator } from '../components/predict/WeekNavigator';
import {
  formatWeekRangeLabel,
  weekEndOf,
  weekOffsetOf,
  weekStartKey,
  weekStartOf,
} from '../components/predict/week';
import {
  fetchGamesRange,
  GAMES_RANGE_MAX_DAYS,
  useLeagueGamesNext,
  useLeagueGamesRange,
  useMyPicks,
  useGameSeasons,
  useStandings,
  useTeams,
} from '../lib/api';
import { gameDateKey, shiftEtDate } from '../lib/game-utils';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/predict')({
  component: PredictPage,
});

type PickFilter = 'all' | 'unpicked' | 'picked';

type Tab = 'slate' | 'picks';

const TABS: { key: Tab; label: string }[] = [
  { key: 'slate', label: 'Slate' },
  { key: 'picks', label: 'My Picks' },
];

const FILTERS: { key: PickFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpicked', label: 'Unpicked' },
  { key: 'picked', label: 'Picked' },
];

const anchorOf = (key: string) => new Date(`${key}T12:00:00.000Z`);
const shiftKey = (key: string, days: number) => shiftEtDate(days, anchorOf(key));

/**
 * The nearest week in `dir` that has any games, skipping empty ones.
 *
 * The NBA calendar has ~14 weeks with no games between one season's Finals and
 * the next preseason, so paging a week at a time strands the reader in the
 * off-season. This walks outward in `GAMES_RANGE_MAX_DAYS`-sized windows — the
 * widest span `GET /games/range` accepts — so crossing a break costs a handful
 * of requests instead of fourteen, and they land in the query cache under the
 * same keys the visible week uses, so re-traversing a break is free.
 */
async function nearestWeekWithGames(
  dir: -1 | 1,
  fromStart: string,
  queryClient: QueryClient,
): Promise<string | null> {
  // Walk in `GAMES_RANGE_MAX_DAYS`-day chunks that never include the week being
  // viewed. `fromStart` is a Sunday, so a backward chunk ending on the day
  // before it aligns exactly with week boundaries — ending it on `fromStart - 7`
  // instead would cut off the week that begins there.
  let cursor = fromStart;

  for (let step = 0; step < 12; step++) {
    const from = dir === 1 ? shiftKey(cursor, 1) : shiftKey(cursor, -GAMES_RANGE_MAX_DAYS);
    const to = dir === 1 ? shiftKey(cursor, GAMES_RANGE_MAX_DAYS) : shiftKey(cursor, -1);

    const games = await queryClient.fetchQuery({
      queryKey: ['league-games-range', from, to],
      queryFn: () => fetchGamesRange(from, to),
      staleTime: 1000 * 60 * 5,
    });
    cursor = dir === 1 ? to : from;
    if (games.length === 0) continue;

    // One window can span several weeks, and — moving forward — can include the
    // week being viewed, whose games spill past `fromStart`. Filter to the weeks
    // strictly in the direction of travel and take the nearest, rather than
    // discarding the whole window when its first week is the current one.
    const weeks = [...new Set(games.map((game) => weekStartOf(gameDateKey(game) ?? from)))]
      .filter((week) => (dir === 1 ? week > fromStart : week < fromStart))
      .sort();
    if (weeks.length === 0) continue;
    return dir === 1 ? weeks[0] : weeks[weeks.length - 1];
  }
  return null;
}

/** The day the panel opens on: today when it has games, else the first day that does. */
function defaultDayKey(days: SlateDay[]): string {
  const today = days.find((day) => day.isToday && day.games.length > 0);
  if (today) return today.key;
  return days.find((day) => day.games.length > 0)?.key ?? days[0]?.key ?? '';
}

function StatStrip({
  stats,
  startKey,
  endKey,
}: {
  stats: SlateStats;
  startKey: string;
  endKey: string;
}) {
  const cells = [
    { label: 'Games', value: String(stats.total), caption: formatWeekRangeLabel(startKey, endKey) },
    { label: 'Picks made', value: `${stats.picked} of ${stats.total}`, caption: 'Locked in' },
    // Counts only games not yet started and not yet picked, so it can be lower
    // than the game total once a slate is under way.
    { label: 'Remaining', value: String(stats.remaining), caption: 'Still open to pick' },
    {
      label: 'Correct',
      value: stats.resolved > 0 ? `${stats.correct} of ${stats.resolved}` : '—',
      caption: 'Resolved picks',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-brand-line bg-brand-line shadow-sm sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1 bg-white px-5 py-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
            {cell.label}
          </span>
          <span className="font-heading text-2xl font-black leading-none tabular-nums text-brand-ink">
            {cell.value}
          </span>
          <span className="truncate text-[11px] text-stone-400">{cell.caption}</span>
        </div>
      ))}
    </div>
  );
}

function SlateSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Loading games</span>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-brand-line bg-brand-line sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse bg-white" />
        ))}
      </div>
      <div className="h-[120px] animate-pulse rounded-xl border border-brand-line bg-white" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[220px] animate-pulse rounded-xl border border-brand-line bg-white"
          />
        ))}
      </div>
    </div>
  );
}

function PredictPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const [tab, setTab] = useState<Tab>('slate');
  const [weekStart, setWeekStart] = useState(() => weekStartKey(0));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<PickFilter>('all');
  const [busy, setBusy] = useState(false);

  const weekEnd = useMemo(() => weekEndOf(weekStart), [weekStart]);
  const weekOffset = weekOffsetOf(weekStart);

  const {
    data: games,
    isLoading,
    isError,
    refetch,
  } = useLeagueGamesRange(weekStart, weekEnd, !!user);
  const { data: teams } = useTeams({ enabled: !!user });
  const { data: standings } = useStandings();
  const { data: nextGames } = useLeagueGamesNext(!!user);
  const { data: seasons } = useGameSeasons(!!user);

  const predictions = usePredictions();
  const myPicks = useMyPicks();

  const days = useMemo(
    () => buildDaysFrom(games, predictions, weekStart),
    [games, predictions, weekStart],
  );
  const stats = useMemo(() => slateStats(days), [days]);
  const historyRows = useMemo(() => rowsFromPicks(myPicks.data), [myPicks.data]);

  const records = useMemo(() => {
    const map = new Map<string, TeamRecord>();
    for (const row of [...(standings?.West ?? []), ...(standings?.East ?? [])]) {
      map.set(row.teamAbbr, { wins: row.wins, losses: row.losses });
    }
    return map;
  }, [standings]);

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  const goToWeek = useCallback((startKey: string) => {
    setWeekStart(startKey);
    setSelectedKey(null);
  }, []);

  const shiftWeek = useCallback(
    async (dir: -1 | 1) => {
      setBusy(true);
      try {
        const target = await nearestWeekWithGames(dir, weekStart, queryClient);
        if (target) goToWeek(target);
      } finally {
        setBusy(false);
      }
    },
    [weekStart, queryClient, goToWeek],
  );

  if (sessionLoading || sessionFetching) return null;
  if (!user || !user.favoriteTeam) return null;

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  const accentColor =
    teams?.find((t) => t.abbreviation === user.favoriteTeam)?.primaryColor ?? '#1C4188';

  const activeKey = selectedKey ?? defaultDayKey(days);
  const activeDay: SlateDay | undefined = days.find((d) => d.key === activeKey) ?? days[0];
  const weekIsEmpty = days.every((d) => d.games.length === 0);
  const nextGameDate = nextGames?.[0]?.gameDate ?? null;

  const visibleGames = (activeDay?.games ?? []).filter((game) => {
    if (filter === 'unpicked') return !predictions[game.id];
    if (filter === 'picked') return Boolean(predictions[game.id]);
    return true;
  });

  return (
    <div className="flex-1 bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="predict"
      />

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-heading text-4xl font-black uppercase tracking-wide text-brand-ink">
            <CalendarDays className="h-8 w-8 text-brand-navy" aria-hidden="true" />
            Predictions
          </h1>
          <p className="text-sm text-stone-500">
            {tab === 'slate'
              ? 'Week at a time, Sunday to Saturday. The arrows skip empty weeks, so you land on the last slate played instead of the off-season.'
              : 'Every pick you have made, newest first, across all seasons.'}
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-brand-line bg-white p-1 shadow-sm sm:max-w-[420px]">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setTab(option.key)}
              aria-pressed={tab === option.key}
              className={`rounded-md px-6 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors ${
                tab === option.key
                  ? 'bg-brand-navyDark text-white shadow'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {tab === 'picks' ? (
          <MyPicksPanel rows={historyRows} />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-line bg-white px-6 py-12 text-center">
            <p className="font-heading text-xl font-black uppercase tracking-wide text-brand-ink">
              Could not load the schedule
            </p>
            <p className="max-w-[46ch] text-sm text-stone-500">
              The games for this week did not come back. Retry, or check back in a moment.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-1 flex items-center gap-2 rounded-md bg-brand-navyDark px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : isLoading ? (
          <SlateSkeleton />
        ) : (
          <div className="flex flex-col gap-6">
            <StatStrip stats={stats} startKey={weekStart} endKey={weekEnd} />

            <WeekNavigator
              days={days}
              activeKey={activeKey}
              onSelect={setSelectedKey}
              weekOffset={weekOffset}
              onShiftWeek={shiftWeek}
              onCurrentWeek={() => goToWeek(weekStartKey(0))}
              busy={busy}
              actions={
                <SeasonMenu
                  seasons={seasons ?? []}
                  activeWeekStart={weekStart}
                  onSelectWeek={goToWeek}
                />
              }
            />

            {weekIsEmpty ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-brand-line bg-white px-6 py-12 text-center">
                <CalendarDays className="h-8 w-8 text-stone-300" aria-hidden="true" />
                <p className="font-heading text-xl font-black uppercase tracking-wide text-brand-ink">
                  No games this week
                </p>
                <p className="max-w-[46ch] text-sm text-stone-500">
                  {nextGameDate
                    ? `The schedule resumes on ${formatSlateDayLabel(nextGameDate)}. Picks open once tip-off times are set.`
                    : 'Check back once the next slate is published.'}
                </p>
              </div>
            ) : (
              <Panel title={activeDay?.label ?? ''} clip contentClassName="!p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-brand-line px-5 py-2">
                  {activeDay?.isToday && (
                    <span className="rounded-full bg-brand-red px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                      Today
                    </span>
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
                    {activeDay?.games.length ?? 0}{' '}
                    {(activeDay?.games.length ?? 0) === 1 ? 'game' : 'games'}
                  </span>
                  {(activeDay?.settled ?? 0) > 0 && (
                    <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">
                      {activeDay?.correct} of {activeDay?.settled} correct
                    </span>
                  )}
                  {(activeDay?.open ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-brand-navy">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Open a game to make your pick
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 rounded-lg border border-brand-line bg-stone-50 p-0.5">
                    {FILTERS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFilter(option.key)}
                        aria-pressed={filter === option.key}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                          filter === option.key
                            ? 'bg-white text-brand-ink shadow-sm'
                            : 'text-stone-500 hover:text-brand-ink'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div id="slate-day-panel" className="p-3">
                  {visibleGames.length === 0 ? (
                    <p className="px-2 py-8 text-center text-sm text-stone-500">
                      {(activeDay?.games.length ?? 0) === 0
                        ? 'No games on this day.'
                        : filter === 'unpicked'
                          ? 'Every game on this day already has a pick.'
                          : 'No picks on this day yet.'}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {visibleGames.map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          teams={teams}
                          picks={predictions[game.id]}
                          records={records}
                          accentColor="#1C4188"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
