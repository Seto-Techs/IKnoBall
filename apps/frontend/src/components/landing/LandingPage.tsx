import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Layers,
  ListOrdered,
  Palette,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useSession } from '../../lib/use-auth';

/*
 * Public marketing page for logged-out visitors.
 *
 * Prototype: the numbers, teams and leaderboard rows below are static mock
 * copy so the page renders without a backend, session or team metadata.
 *
 * Palette is IKnoBall's own: navy for the dark surfaces, the basketball red
 * for every accent. Deliberately no gradient blobs, no glow, no gold.
 */

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#scoring', label: 'Scoring' },
  { href: '#board', label: 'Standings' },
];

const STEPS = [
  {
    icon: ShieldCheck,
    title: 'Pick your team',
    body: 'Choose a franchise and the dashboard takes on its colors: schedule, form and stat leaders.',
  },
  {
    icon: Target,
    title: 'Call the games',
    body: 'Pick every game on the slate before tip‑off. One submit scores on both leaderboards.',
  },
  {
    icon: Trophy,
    title: 'Climb the board',
    body: 'Points settle at the final buzzer, every night of the season.',
  },
];

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Live scores and schedules',
    body: "Tonight's slate and the next seven days, tip‑off to final buzzer.",
  },
  {
    icon: ListOrdered,
    title: 'Standings with context',
    body: 'Conference races, games back and clinch markers before they matter.',
  },
  {
    icon: TrendingUp,
    title: 'Stat leaders',
    body: 'League-wide and by team, updated as games finish rather than the next morning.',
  },
  {
    icon: Target,
    title: 'Odds-aware scoring',
    body: 'Real moneyline prices, so backing a long shot actually pays like one.',
  },
  {
    icon: Layers,
    title: 'Two ways to play',
    body: 'Flat for the purists, weighted for the risk-takers. One pick writes to both.',
  },
  {
    icon: Palette,
    title: 'Built for your team',
    body: 'A dashboard in your franchise’s colors, because that is whose season it is.',
  },
];

const LEADERS = [
  { rank: 1, name: 'bucketbandit', flat: '412', weighted: '1,284.5' },
  { rank: 2, name: 'zone_defense', flat: '398', weighted: '1,201.0' },
  { rank: 3, name: 'your_user', flat: '391', weighted: '1,176.5', you: true },
  { rank: 4, name: 'glasscleaner', flat: '377', weighted: '1,090.0' },
  { rank: 5, name: 'postupszn', flat: '364', weighted: '1,042.5' },
];

const WORDMARK = 'IKnoBall';

/** Real team marks, bundled locally: the NBA CDN is IPv4-only, and a broken
 *  logo is worse than none, so these never depend on a third-party host. */
function TeamLogo({ src, alt, abbr }: { src: string; alt: string; abbr: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 font-heading text-base font-black tracking-tight text-white">
        {abbr}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 object-contain"
    />
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-basketball-500 font-heading text-base font-black text-white">
        IK
      </span>
      <span
        className={`font-heading text-lg font-bold uppercase tracking-wide sm:text-2xl ${className ?? ''}`}
      >
        {WORDMARK}
      </span>
    </span>
  );
}

function LandingNav() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-navyDark/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5 sm:px-8">
        <Link to="/" className="text-white" aria-label="IKnoBall home">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <Link
              to="/dashboard"
              search={{ tab: 'team' }}
              className="whitespace-nowrap rounded-lg bg-basketball-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 sm:px-4"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-white/70 sm:px-3 transition-colors hover:bg-white/10 hover:text-white"
              >
                Sign in
              </Link>
              <Link
                to="/auth/register"
                className="whitespace-nowrap rounded-lg bg-basketball-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 sm:px-4"
              >
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Mock matchup card — the hero visual. Static, not interactive. */
function PickCard() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
          Tonight · 7:30 PM ET
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Not yet locked
        </span>
      </div>

      <div className="divide-y divide-white/10">
        {[
          {
            abbr: 'LAL',
            name: 'Lakers',
            record: '41-27',
            odds: '2.55',
            logo: '/logos/lakers.svg',
            picked: false,
          },
          {
            abbr: 'BOS',
            name: 'Celtics',
            record: '52-16',
            odds: '1.52',
            logo: '/logos/celtics.svg',
            picked: true,
          },
        ].map((team) => (
          <div
            key={team.abbr}
            className={`relative flex items-center gap-3.5 px-5 py-4 ${team.picked ? 'bg-basketball-500/10' : ''}`}
          >
            {team.picked && (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-1 bg-basketball-500"
              />
            )}
            <TeamLogo src={team.logo} alt={team.name} abbr={team.abbr} />
            <span className="min-w-0">
              <span className="block font-heading text-lg font-bold uppercase tracking-wide text-white">
                {team.name}
              </span>
              <span className="block text-xs font-medium tabular-nums text-white/45">
                {team.record}
              </span>
            </span>
            <span className="ml-auto text-right">
              <span className="block font-heading text-xl font-black tabular-nums text-white">
                {team.odds}
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                ML
              </span>
            </span>
            {team.picked ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-basketball-500 text-white">
                <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />
              </span>
            ) : (
              <span aria-hidden="true" className="h-6 w-6 shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
            Weighted payout if correct
          </span>
          <span className="block font-heading text-2xl font-black tabular-nums text-basketball-400">
            15.2 pts
          </span>
        </span>
        <span className="rounded-lg bg-basketball-500 px-4 py-2 text-sm font-semibold text-white">
          Lock in pick
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-brand-navyDark text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            2025–26 season · 30 teams
          </span>

          <h1 className="mt-6 font-heading text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Pick every game.
            <br />
            <span className="text-basketball-400">Score it two ways.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            A season-long prediction game settled against real moneyline odds, sitting alongside the
            scores, standings and stat leaders for all 30 teams.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-basketball-500 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-basketball-600"
            >
              Create account
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/predict"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              See the slate
            </Link>
          </div>

          <p className="mt-6 text-sm text-white/50">
            Email or Discord · No card · Free for the season
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <PickCard />
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  tone = 'dark',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <div className="max-w-2xl">
      <p
        className={`text-xs font-bold uppercase tracking-[0.18em] ${
          tone === 'dark' ? 'text-basketball-500' : 'text-basketball-400'
        }`}
      >
        {eyebrow}
      </p>
      <h2
        className={`mt-3 font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl ${
          tone === 'dark' ? 'text-brand-ink' : 'text-white'
        }`}
      >
        {title}
      </h2>
      {body && (
        <p className={`mt-4 text-lg ${tone === 'dark' ? 'text-stone-600' : 'text-white/65'}`}>
          {body}
        </p>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="From tip‑off to trophy"
          body="Three steps between you and the top of the board."
        />

        <ol className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-brand-line pt-5">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-basketball-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <step.icon className="h-5 w-5 text-basketball-500" aria-hidden="true" />
              </div>
              <h3 className="mt-3 font-heading text-2xl font-bold uppercase tracking-wide text-brand-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-stone-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-y border-brand-line bg-court-50 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Everything but the ticket stub"
          body="The stats you already refresh ten times a night, and the game built on top of them."
        />

        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="border-t border-brand-line pt-5">
              <feature.icon className="h-5 w-5 text-basketball-500" aria-hidden="true" />
              <h3 className="mt-3 font-heading text-xl font-bold uppercase tracking-wide text-brand-ink">
                {feature.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScoringModes() {
  return (
    <section id="scoring" className="scroll-mt-20 bg-brand-navyDark py-20 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          tone="light"
          eyebrow="Scoring"
          title="Two boards, one pick"
          body="Every pick scores twice. Play it safe on one board, swing for the fences on the other, then find out which version of you is better."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/15 bg-white/15 lg:grid-cols-2">
          <div className="flex h-full flex-col bg-brand-navyDark p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
              <ListOrdered className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-heading text-3xl font-black uppercase tracking-wide">Flat</h3>
            <p className="mt-3 text-white/65">
              The purist&rsquo;s board. Every game is worth the same, so calling the winner is all
              that matters.
            </p>
            <p className="mt-auto pt-7 font-heading text-4xl font-black tabular-nums text-basketball-400">
              1 pt <span className="text-lg text-white/55">per correct pick</span>
            </p>
          </div>

          <div className="flex h-full flex-col bg-brand-navyDark p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
              <Target className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-heading text-3xl font-black uppercase tracking-wide">
              Weighted
            </h3>
            <p className="mt-3 text-white/65">
              Correct picks pay out at the price you locked, so an underdog is worth far more than a
              favorite.
            </p>
            <p className="mt-auto pt-7 font-heading text-4xl font-black tabular-nums text-basketball-400">
              41 pts <span className="text-lg text-white/55">if a 4.10 underdog wins</span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm text-white/50">
          Picks close at tip‑off · Your price locks when you submit · Postponed games do not count
        </p>
      </div>
    </section>
  );
}

function LeaderboardPreview() {
  return (
    <section id="board" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              eyebrow="Leaderboard"
              title="A season-long race"
              body="Top 50, settled every night. Two independent boards, scored from the same pick, so there are two ways to brag and two ways to get humbled."
            />
            <Link
              to="/auth/register"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-navyDark"
            >
              Claim your spot
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-brand-line">
            <div className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-4">
              <span className="font-heading text-xl font-bold uppercase tracking-wide text-brand-ink sm:text-2xl">
                Season standings
              </span>
              <div className="flex rounded-lg bg-stone-100 p-1 text-[11px] font-bold uppercase tracking-[0.14em]">
                <span className="rounded-md bg-white px-2.5 py-1.5 text-brand-navy shadow-sm">
                  Flat
                </span>
                <span className="px-2.5 py-1.5 text-stone-500">Weighted</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-line text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">
                    <th className="px-3 py-3 sm:px-5">#</th>
                    <th className="px-1.5 py-3 sm:px-3">Player</th>
                    <th className="px-1.5 py-3 text-right sm:px-3">Flat</th>
                    <th className="px-3 py-3 text-right sm:px-5">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERS.map((row) => (
                    <tr
                      key={row.rank}
                      className={`border-b border-brand-line/70 last:border-0 ${
                        row.you ? 'bg-basketball-50' : ''
                      }`}
                    >
                      <td className="px-3 py-3.5 font-heading text-base font-black tabular-nums text-stone-400 sm:px-5 sm:text-lg">
                        {row.rank}
                      </td>
                      <td className="px-1.5 py-3.5 sm:px-3">
                        <span className="flex items-center gap-2.5">
                          <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-bold uppercase text-white sm:flex">
                            {row.name.charAt(0)}
                          </span>
                          <span className="font-semibold text-brand-ink">{row.name}</span>
                          {row.you && (
                            <span className="rounded-full bg-basketball-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                              You
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-1.5 py-3.5 text-right font-heading text-base font-bold tabular-nums text-brand-ink sm:px-3 sm:text-lg">
                        {row.flat}
                      </td>
                      <td className="px-3 py-3.5 text-right font-heading text-base font-bold tabular-nums text-brand-ink sm:px-5 sm:text-lg">
                        {row.weighted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-white/10 bg-brand-navyDark px-5 py-16 text-white sm:px-8 sm:py-20">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h2 className="font-heading text-4xl font-black uppercase leading-tight tracking-tight sm:text-5xl">
            The season is already under way
          </h2>
          <p className="mt-4 text-lg text-white/65">
            Create an account, pick your team, and call tonight&rsquo;s slate.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/auth/register"
            className="inline-flex items-center gap-2 rounded-xl bg-basketball-500 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-basketball-600"
          >
            Create account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/auth/login"
            className="inline-flex items-center rounded-xl border border-white/25 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-brand-navyDark px-5 py-14 text-white/60 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo className="text-white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Stats, schedules and a prediction game for people who watch the whole fourth quarter.
          </p>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-white">
            Product
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link
                to="/dashboard"
                search={{ tab: 'team' }}
                className="transition-colors hover:text-white"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link to="/predict" className="transition-colors hover:text-white">
                Predictions
              </Link>
            </li>
            <li>
              <a href="#board" className="transition-colors hover:text-white">
                Standings
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-white">
            Account
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link to="/auth/login" className="transition-colors hover:text-white">
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/auth/register" className="transition-colors hover:text-white">
                Create account
              </Link>
            </li>
            <li>
              <a href="#features" className="transition-colors hover:text-white">
                Features
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>© 2026 IKnoBall.</span>
        <span className="text-white/40">Not affiliated with, or endorsed by, the NBA.</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div id="top" className="scroll-smooth bg-white text-brand-ink">
      <LandingNav />
      <Hero />
      <HowItWorks />
      <Features />
      <ScoringModes />
      <LeaderboardPreview />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
