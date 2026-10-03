import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Sparkles } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { Panel } from '../components/dashboard/shared';
import { GameCard, type TeamRecord } from '../components/predict/GameCard';
import { hasPick, usePredictions } from '../components/predict/predictions';
import { WeekRail } from '../components/predict/WeekRail';
import {
  buildSlateDays,
  defaultSlateDayKey,
  formatSlateDayLabel,
  SLATE_DAY_COUNT,
  slateStats,
  type SlateDay,
  type SlateStats,
} from '../components/predict/slate';
import { useLeagueGamesNext, useLeagueGamesRange, useStandings, useTeams } from '../lib/api';
import { shiftEtDate } from '../lib/game-utils';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/predict')({
  component: PredictPage,
});

type PickFilter = 'all' | 'unpicked' | 'picked';

const FILTERS: { key: PickFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpicked', label: 'Unpicked' },
  { key: 'picked', label: 'Picked' },
];

function StatStrip({ stats }: { stats: SlateStats }) {
  const cells = [
    { label: 'Games', value: String(stats.total), caption: 'Next 7 days' },
    { label: 'Picks made', value: `${stats.picked} of ${stats.total}`, caption: 'Locked in' },
    { label: 'Remaining', value: String(stats.remaining), caption: 'Still to pick' },
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
          <span className="text-[11px] text-stone-400">{cell.caption}</span>
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
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white">
        <div className="grid grid-cols-7 divide-x divide-brand-line">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[92px] animate-pulse bg-white" />
          ))}
        </div>
      </div>
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
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  // Today through today+6 in US/Eastern, which is how the schedule dates its days.
  const from = useMemo(() => shiftEtDate(0), []);
  const to = useMemo(() => shiftEtDate(SLATE_DAY_COUNT - 1), []);
  const { data: games, isLoading, isError, refetch } = useLeagueGamesRange(from, to, !!user);
  const { data: teams } = useTeams({ enabled: !!user });
  const { data: standings } = useStandings();
  const { data: nextGames } = useLeagueGamesNext(!!user);

  const predictions = usePredictions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<PickFilter>('all');

  const days = useMemo(() => buildSlateDays(games, predictions), [games, predictions]);
  const stats = useMemo(() => slateStats(days, predictions), [days, predictions]);

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

  if (sessionLoading || sessionFetching) return null;
  if (!user || !user.favoriteTeam) return null;

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  const headerAccentColor =
    teams?.find((t) => t.abbreviation === user.favoriteTeam)?.primaryColor ?? '#1C4188';

  const activeKey = selectedKey ?? defaultSlateDayKey(days);
  const activeDay: SlateDay | undefined = days.find((d) => d.key === activeKey) ?? days[0];
  const weekIsEmpty = days.every((d) => d.games.length === 0);
  const nextGameDate = nextGames?.[0]?.gameDate ?? null;

  const visibleGames = (activeDay?.games ?? []).filter((game) => {
    if (filter === 'unpicked') return !hasPick(predictions[game.id]);
    if (filter === 'picked') return hasPick(predictions[game.id]);
    return true;
  });

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader
        userName={user.name}
        accentColor={headerAccentColor}
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
            The next seven days of games. Open a game to lock in your pick and see the full
            breakdown.
          </p>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-line bg-white px-6 py-12 text-center">
            <p className="font-heading text-xl font-black uppercase tracking-wide text-brand-ink">
              Could not load the schedule
            </p>
            <p className="max-w-[46ch] text-sm text-stone-500">
              The games for this window did not come back. Retry, or check back in a moment.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-1 flex items-center gap-2 rounded-full bg-brand-navyDark px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : isLoading ? (
          <SlateSkeleton />
        ) : (
          <div className="flex flex-col gap-6">
            <StatStrip stats={stats} />

            {weekIsEmpty ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-brand-line bg-white px-6 py-12 text-center">
                <CalendarDays className="h-8 w-8 text-stone-300" aria-hidden="true" />
                <p className="font-heading text-xl font-black uppercase tracking-wide text-brand-ink">
                  No games in the next seven days
                </p>
                <p className="max-w-[46ch] text-sm text-stone-500">
                  {nextGameDate
                    ? `The schedule resumes on ${formatSlateDayLabel(nextGameDate)}. Picks open once tip-off times are set.`
                    : 'Check back once the next slate is published.'}
                </p>
              </div>
            ) : (
              <>
                <WeekRail days={days} activeKey={activeKey} onSelect={setSelectedKey} />

                <Panel
                  title={activeDay?.label ?? ''}
                  className="overflow-hidden"
                  contentClassName="!p-0"
                >
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
