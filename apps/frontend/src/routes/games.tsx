import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowRight, Gamepad2, History, Info } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { Panel } from '../components/dashboard/shared';
import { Avatar } from '../components/profile/parts';
import { ScoreMeter, gradeLabel } from '../components/connect/parts';
import { GameCard } from '../components/games/GameCard';
import { SectionHead } from '../components/games/SectionHead';
import { LEBRONNECT, MINI_GAMES } from '../components/games/catalog';
import { useTeams } from '../lib/api';
import {
  headshotUrl,
  offsetLabel,
  useLebronnectMe,
  useLebronnectPuzzle,
  type ConnectPlayer,
} from '../lib/use-lebronnect';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/games')({
  component: GamesPage,
});

/**
 * The mini games page.
 *
 * Its own page rather than a fourth dashboard tab: the games are a second thing
 * you do on the site, so they get their own door and their own shelf. The hero
 * band answers "what is this and what is live today"; the shelf shows every game
 * with the ones still in the works beside the one you can play; the two panels
 * below answer the only questions a returning player has — how did I do, and how
 * is it scored.
 *
 * Every number on it is the viewer's own: the streak, the solve count, the mean
 * over par and the last five boards all come off `/minigames/lebronnect/me`, and
 * the board the hero advertises is the one the game is actually serving.
 */
function GamesPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { data: teams } = useTeams({ enabled: !!user });
  const { data: board } = useLebronnectPuzzle();
  const { data: me } = useLebronnectMe(!!user);
  const stats = me?.stats;
  const history = stats?.results ?? [];

  // `emoji` replaces the label where a symbol reads faster than a word; the word
  // stays for screen readers.
  const STATS: { label: string; emoji?: string; value: string; caption: string }[] = [
    { label: 'Streak', emoji: '🔥', value: String(stats?.streak ?? 0), caption: 'day streak' },
    { label: 'Solved', value: String(stats?.solved ?? 0), caption: 'puzzles all time' },
    { label: 'Average', value: offsetLabel(stats?.average ?? 0), caption: 'links over par' },
  ];

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user || !user.favoriteTeam) return null;

  const team = teams?.find((t) => t.abbreviation === user.favoriteTeam) ?? null;
  const accentColor = team?.primaryColor ?? '#1C4188';

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  return (
    <div className="flex-1 bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="games"
      />

      {/* ── Band: what this page is, and the one game that is live ── */}
      <section className="bg-brand-navyDark text-white">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                Mini games ·{' '}
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <h1 className="mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">
                One puzzle.
                <br />
                <span className="text-basketball-400">Every day.</span>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
                LeBronnect is the first one: bridge two players through teammates, one name per
                link. The next games are in the works, and one streak covers all of them.
              </p>

              <dl className="mt-7 grid max-w-md grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                {STATS.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`px-4 py-3 ${index > 0 ? 'border-l border-white/10' : ''}`}
                  >
                    <dt className="flex min-h-3 items-center text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                      {stat.emoji ? (
                        <>
                          <span className="text-[15px] leading-none" aria-hidden="true">
                            {stat.emoji}
                          </span>
                          <span className="sr-only">{stat.label}</span>
                        </>
                      ) : (
                        stat.label
                      )}
                    </dt>
                    <dd className="mt-1 font-heading text-2xl font-black leading-none tabular-nums text-white">
                      {stat.value}
                    </dd>
                    <dd className="mt-1 text-[10px] leading-tight text-white/40">{stat.caption}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Today's board, as the single call to action. */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                <span>Puzzle #{board?.number ?? '—'}</span>
                <span className="inline-flex items-center gap-1.5 text-white/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Resets in 8h
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <BoardFace player={board?.start} />
                <span className="flex flex-col items-center gap-1 text-white/35">
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em]">bridge</span>
                </span>
                <BoardFace player={board?.target} />
              </div>

              <Link
                to={LEBRONNECT.to}
                className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-basketball-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-basketball-600"
              >
                Play today&rsquo;s LeBronnect
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <p className="mt-3 text-center text-[11px] text-white/40">
                Same board for everyone · no hints
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Shelf ── */}
      <section className="border-b border-brand-line bg-brand-cream">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-14">
          <SectionHead
            kicker="The shelf"
            title="Play now, more coming"
            aside={
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                1 to play · 1 in the works
              </span>
            }
          >
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-600">
              Every game shares one account, one streak and one leaderboard.
            </p>
          </SectionHead>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MINI_GAMES.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Record + rules: the two things a returning player wants ── */}
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-14">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Panel
            title="Your last five"
            icon={<History className="h-5 w-5 text-brand-orange" aria-hidden="true" />}
            clip
          >
            {history.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[13px] font-semibold text-brand-ink">No boards finished yet</p>
                <p className="mx-auto mt-1 max-w-[26ch] text-[11px] leading-relaxed text-stone-500">
                  Finish today&rsquo;s and the grade lands here with the rest of the week.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-brand-line">
                {history.map((row) => (
                  <li
                    key={row.number}
                    className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5"
                  >
                    <span className="w-8 shrink-0 font-heading text-sm font-bold tabular-nums text-stone-400">
                      #{row.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-brand-ink">
                        {row.start.name}
                        <span className="px-1 text-stone-400">→</span>
                        {row.target.name}
                      </span>
                      <span className="block text-[11px] text-stone-500">
                        {shortDate(row.date)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ScoreMeter
                        rating={row.blocks}
                        label={gradeLabel(row.players, row.par)}
                        tone="light"
                      />
                      <span className="hidden w-16 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500 sm:block">
                        {gradeLabel(row.players, row.par)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-brand-line bg-stone-50 px-5 py-3">
              <span className="text-[11px] text-stone-500">
                {stats?.solved ?? 0} solved all time
              </span>
              <span className="text-[11px] font-semibold text-brand-navy">
                avg {offsetLabel(stats?.average ?? 0)} over par
              </span>
            </div>
          </Panel>

          <Panel
            title="How it scores"
            icon={<Info className="h-5 w-5 text-brand-orange" aria-hidden="true" />}
            clip
          >
            <ul className="divide-y divide-brand-line text-[13px] leading-relaxed text-stone-600">
              <li className="px-5 py-3">
                <span className="block font-heading text-[13px] font-bold uppercase tracking-wide text-brand-ink">
                  One board a day
                </span>
                Resets at midnight ET. The puzzle stays playable all day; only the first solve
                counts for the streak.
              </li>
              <li className="px-5 py-3">
                <span className="block font-heading text-[13px] font-bold uppercase tracking-wide text-brand-ink">
                  A link is a shared season
                </span>
                Any player who was on the same roster in the same season as the one before them.
                Start and target are free.
              </li>
              <li className="px-5 py-3">
                <span className="block font-heading text-[13px] font-bold uppercase tracking-wide text-brand-ink">
                  Five blocks, par is five
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <ScoreMeter rating={5} label="Par" tone="light" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                    on par
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <ScoreMeter rating={2} label="Off by 3" tone="light" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                    each extra link costs one
                  </span>
                </span>
              </li>
            </ul>
          </Panel>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-stone-500">
          Every figure above is yours, counted from your own solves. The board itself runs on every
          box score on file.
        </p>
      </section>
    </div>
  );
}

/** One endpoint of today's board: the face, with the surname under it. */
function BoardFace({ player }: { player?: ConnectPlayer }) {
  return (
    <span className="flex flex-col items-center gap-2">
      {player ? (
        <Avatar
          name={player.name}
          image={headshotUrl(player.externalId)}
          size={64}
          className="ring-2 ring-white/20"
        />
      ) : (
        <span className="h-16 w-16 rounded-full bg-white/10 ring-2 ring-white/20" />
      )}
      <span className="max-w-[92px] truncate font-heading text-[11px] font-bold uppercase tracking-wide text-white">
        {player ? player.name.split(' ').at(-1) : '—'}
      </span>
    </span>
  );
}

/** `Nov 7` — the board only records the day, so the year is noise. */
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
