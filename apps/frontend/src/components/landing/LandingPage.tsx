import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Flame,
  Layers,
  ListOrdered,
  Palette,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useSession } from '../../lib/use-auth';

/*
 * Public marketing page for logged-out visitors.
 *
 * Prototype: every number, team and leaderboard row below is static mock copy
 * so the page renders without a backend, session or team metadata. Wire these
 * to real endpoints only once the layout is signed off.
 */

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#scoring', label: 'Scoring' },
  { href: '#board', label: 'Leaderboard' },
];

const STEPS = [
  {
    icon: ShieldCheck,
    title: 'Pick your team',
    body: 'Choose your franchise and get a dashboard built around it — schedule, recent form and stat leaders, in your team’s colours.',
  },
  {
    icon: Target,
    title: 'Call the winners',
    body: 'Every game on the slate, every night. Pick before tip-off and lock your price. One pick scores on both boards at once.',
  },
  {
    icon: Trophy,
    title: 'Climb the board',
    body: 'Points settle at the final buzzer. A season-long race, two independent leaderboards, one crown.',
  },
];

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Live scores & schedules',
    body: 'Tip-off to final buzzer. Tonight’s slate, the next seven days and every box score in between.',
  },
  {
    icon: ListOrdered,
    title: 'Standings with context',
    body: 'Conference races, games back and clinch markers — so a win means something before April.',
  },
  {
    icon: TrendingUp,
    title: 'Stat leaders',
    body: 'League-wide and team-level leaders, updated as the games happen, not the morning after.',
  },
  {
    icon: Target,
    title: 'Odds-aware scoring',
    body: 'Real moneyline prices, de-vigged so favourites aren’t free points. Your price is frozen when you submit.',
  },
  {
    icon: Layers,
    title: 'Two ways to play',
    body: 'Flat for the purists, weighted for the risk-takers. One pick writes to both — compare against both.',
  },
  {
    icon: Palette,
    title: 'Built for your team',
    body: 'A dashboard that takes on your franchise’s colours. It feels like your team’s site, because it is.',
  },
];

const LEADERS = [
  { rank: 1, name: 'bucketbandit', flat: '412', weighted: '1,284.5' },
  { rank: 2, name: 'zone_defense', flat: '398', weighted: '1,201.0' },
  { rank: 3, name: 'rakaiseto', flat: '391', weighted: '1,176.5', you: true },
  { rank: 4, name: 'glasscleaner', flat: '377', weighted: '1,090.0' },
  { rank: 5, name: 'postupszn', flat: '364', weighted: '1,042.5' },
];

const WORDMARK = 'IKnoBall';

function Logo({ className }: { className?: string }) {
  return (
    <span className="flex items-center gap-1.5 sm:gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red font-heading text-base font-black text-white shadow-sm ring-1 ring-white/10 sm:h-9 sm:w-9">
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-navyDark/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link to="/" className="text-white" aria-label="IKnoBall home">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="ml-6 hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold uppercase tracking-widest text-white/60 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2.5">
          {user ? (
            <Link
              to="/dashboard"
              search={{ tab: 'team' }}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navyDark transition-colors hover:bg-brand-gold/90"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:px-3"
              >
                Sign in
              </Link>
              <Link
                to="/auth/register"
                className="whitespace-nowrap rounded-lg bg-brand-gold px-2.5 py-2 text-sm font-bold text-brand-navyDark shadow-sm transition-colors hover:bg-brand-gold/90 sm:px-4"
              >
                Get started
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
    <div className="relative w-full max-w-sm">
      <div
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-gold/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-navy/70 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
            <Radio className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Tonight · 7:30 PM ET
          </span>
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Locked
          </span>
        </div>

        <div className="divide-y divide-white/10">
          {[
            { abbr: 'LAL', name: 'Lakers', record: '41-27', odds: '2.55', picked: false },
            { abbr: 'BOS', name: 'Celtics', record: '52-16', odds: '1.52', picked: true },
          ].map((team) => (
            <div
              key={team.abbr}
              className={`relative flex items-center gap-3.5 px-5 py-4 ${team.picked ? 'bg-brand-gold/10' : ''}`}
            >
              {team.picked && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-1.5 rounded-r-full bg-brand-gold shadow-[0_0_12px_rgba(253,185,39,0.7)]"
                />
              )}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 font-heading text-lg font-black tracking-tight text-white">
                {team.abbr}
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold uppercase tracking-wide text-white">
                  {team.name}
                </span>
                <span className="block text-xs font-medium tabular-nums text-white/50">
                  {team.record}
                </span>
              </span>
              <span className="ml-auto text-right">
                <span className="block font-heading text-xl font-black tabular-nums text-white">
                  {team.odds}
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  ML
                </span>
              </span>
              {team.picked && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gold text-brand-navyDark">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-5 py-4">
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/50">
              Weighted payout
            </span>
            <span className="block font-heading text-2xl font-black tabular-nums text-brand-gold">
              15.2 pts
            </span>
          </span>
          <span className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navyDark">
            Lock in pick
          </span>
        </div>
      </div>

      <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-xl border border-white/10 bg-brand-navyDark/90 px-3.5 py-2 shadow-xl backdrop-blur sm:flex">
        <Flame className="h-4 w-4 text-brand-gold" aria-hidden="true" />
        <span className="text-xs font-semibold text-white/80">
          <span className="font-bold text-white">3 games</span> live right now
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-brand-navyDark text-white">
      {/* Decorative court: a glow, faint sidelines and a centre circle. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 55% at 78% 8%, rgba(253,185,39,0.16), transparent 60%), radial-gradient(55% 60% at 8% 100%, rgba(28,65,136,0.55), transparent 65%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-8 h-[18rem] w-[18rem] rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
            <Sparkles className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
            NBA 2025-26 · Predictions, scores & stats
          </span>

          <h1 className="mt-6 font-heading text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Call every game.
            <br />
            <span className="text-brand-gold">Own the board.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            IKnoBall is the home court for hoop heads. Pick every winner, score flat or weighted
            against real odds, and climb a season-long leaderboard — with live scores, standings and
            stat leaders right beside it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3.5 text-base font-bold text-brand-navyDark shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
            >
              Get started — it’s free
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/predict"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Explore the slate
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/60">
            {['Email or Discord', 'No credit card', 'Set up in two minutes'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-brand-gold" aria-hidden="true" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <PickCard />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-red">
            How it works
          </p>
          <h2 className="mt-3 font-heading text-4xl font-black uppercase tracking-tight text-brand-ink sm:text-5xl">
            From tip-off to trophy
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            Three steps between you and the top of the board. No spreadsheets, no spreadsheet
            energy.
          </p>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-brand-line bg-court-50 p-7 shadow-sm"
            >
              <span className="absolute right-6 top-5 font-heading text-5xl font-black leading-none text-brand-line">
                0{i + 1}
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy text-white shadow-sm">
                <step.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-heading text-2xl font-bold uppercase tracking-wide text-brand-ink">
                {step.title}
              </h3>
              <p className="mt-2.5 text-stone-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-24 bg-court-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-red">Features</p>
          <h2 className="mt-3 font-heading text-4xl font-black uppercase tracking-tight text-brand-ink sm:text-5xl">
            Everything but the ticket stub
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            The stats you already refresh ten times a night, and the game built on top of them.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-brand-line bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red transition-colors group-hover:bg-brand-red group-hover:text-white">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-heading text-xl font-bold uppercase tracking-wide text-brand-ink">
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
    <section id="scoring" className="scroll-mt-24 bg-brand-navyDark py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Scoring</p>
          <h2 className="mt-3 font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl">
            Two boards, one pick
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Every pick scores on both boards. Play it safe on one, swing for the fences on the other
            — then see which version of you is better.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <BarChart3 className="h-6 w-6 text-white" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-heading text-3xl font-black uppercase tracking-wide">Flat</h3>
            <p className="mt-3 text-white/70">
              The purist’s board. Call the winner, bank a point. Every game is worth exactly the
              same, and nobody gets bailed out by a long shot.
            </p>
            <p className="mt-6 font-heading text-5xl font-black tabular-nums text-brand-gold">
              1 <span className="text-2xl text-white/60">point / correct pick</span>
            </p>
          </div>

          <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/10 p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gold text-brand-navyDark">
              <Target className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-heading text-3xl font-black uppercase tracking-wide">
              Weighted
            </h3>
            <p className="mt-3 text-white/70">
              Correct picks pay like a one-unit bet at the price you locked. Favourites pay little,
              underdogs pay plenty — and prices are de-vigged, so no strategy is free money.
            </p>
            <p className="mt-6 font-heading text-3xl font-black tabular-nums text-brand-gold">
              points = min(round(K · d), 150)
            </p>
            <p className="mt-2 text-sm text-white/50">
              K = 10 · d = your de-vigged decimal price, frozen at submit
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 rounded-2xl border border-white/10 bg-black/20 px-6 py-4 text-sm text-white/70">
          {[
            'Picks close exactly at tip-off',
            'Odds are frozen when you submit',
            'Postponed games are voided, not lost',
          ].map((rule) => (
            <span key={rule} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-brand-gold" aria-hidden="true" strokeWidth={3} />
              {rule}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeaderboardPreview() {
  return (
    <section id="board" className="scroll-mt-24 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-red">
              Leaderboard
            </p>
            <h2 className="mt-3 font-heading text-4xl font-black uppercase tracking-tight text-brand-ink sm:text-5xl">
              Somebody’s going to be insufferable
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              A season-long ranked race, top 50, settled every night. Two independent boards mean
              two ways to brag — and two ways to get humbled.
            </p>
            <Link
              to="/auth/register"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-navyDark"
            >
              Claim your spot
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-brand-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-brand-line px-5 py-4">
              <span className="font-heading text-xl font-bold uppercase tracking-wide text-brand-ink sm:text-2xl">
                Season standings
              </span>
              <div className="flex rounded-lg bg-stone-100 p-1 text-xs font-bold uppercase tracking-widest">
                <span className="rounded-md bg-white px-3 py-1.5 text-brand-navy shadow-sm">
                  Flat
                </span>
                <span className="px-3 py-1.5 text-stone-500">Weighted</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-line text-[11px] font-bold uppercase tracking-widest text-stone-400">
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
                        row.you ? 'bg-brand-gold/10' : ''
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
                            <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-navyDark">
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
    <section className="bg-court-50 px-5 pb-20 sm:px-8 sm:pb-24">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-brand-red px-8 py-14 text-white sm:px-14 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(50% 80% at 85% 20%, rgba(253,185,39,0.25), transparent 60%)',
          }}
        />
        <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="font-heading text-4xl font-black uppercase leading-tight tracking-tight sm:text-5xl">
              The season’s already tipping off
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Make an account, pick your team, and call tonight’s slate. Free, forever.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3.5 text-base font-bold text-brand-navyDark shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
            >
              Create your account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-xl border border-white/30 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="bg-brand-navyDark px-5 py-14 text-white/60 sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo className="text-white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Stats, schedules and a prediction game for people who watch the whole fourth quarter.
          </p>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-widest text-white">
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
                Leaderboard
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-widest text-white">
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

      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 IKnoBall. Built for hoop heads.</p>
        <p className="text-white/40">Not affiliated with, or endorsed by, the NBA.</p>
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
