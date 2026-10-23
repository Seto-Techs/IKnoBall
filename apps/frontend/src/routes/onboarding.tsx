import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { isLightColor, darken } from '../lib/color';
import { useSaveTeam, useTeams, type TeamWithLeaders } from '../lib/api';
import { TeamMark } from '../components/TeamMark';
import { useSession } from '../lib/use-auth';

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const [selected, setSelected] = useState<TeamWithLeaders | null>(null);
  const bodyBg = selected ? darken(selected.primaryColor, 0.45) : '';
  const isLightBody = selected ? isLightColor(bodyBg) : false;
  const isLightCard = selected ? isLightColor(selected.primaryColor) : false;
  const saveTeam = useSaveTeam();
  const { data: teams } = useTeams({ enabled: !!session?.user });

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!session?.user) navigate({ to: '/auth/login' });
  }, [sessionLoading, sessionFetching, session?.user, navigate]);

  const conferences = useMemo(() => {
    const order: Record<string, { label: string; key: string; divisions: string[] }> = {
      West: {
        label: 'WESTERN CONFERENCE',
        key: 'West',
        divisions: ['Northwest', 'Pacific', 'Southwest'],
      },
      East: {
        label: 'EASTERN CONFERENCE',
        key: 'East',
        divisions: ['Atlantic', 'Central', 'Southeast'],
      },
    };
    return [order.West, order.East];
  }, []);

  // Animate root background to the selected team's primary color (darkened)
  useEffect(() => {
    if (selected) {
      document.documentElement.style.setProperty('--team-bg', darken(selected.primaryColor, 0.45));
    } else {
      document.documentElement.style.removeProperty('--team-bg');
    }
    return () => {
      document.documentElement.style.removeProperty('--team-bg');
    };
  }, [selected]);
  if (sessionLoading || sessionFetching) return null;
  if (!session?.user) return null;

  const submit = () => {
    if (!selected || saveTeam.isPending) return;
    saveTeam.mutate(selected.abbreviation, {
      onSuccess: () => navigate({ to: '/dashboard', search: {} as never }),
    });
  };

  return (
    <div
      className={`relative grid grid-cols-1 gap-8 xl:grid-cols-[1fr_340px] ${
        // The phone action bar floats over the bottom of the page; without this
        // the last row of chips can sit under it.
        selected ? 'pb-24 xl:pb-0' : ''
      }`}
      style={{ minHeight: 'calc(100dvh - 80px)' }}
    >
      {/* ── Left: Team Grid ─────────────────────────────────── */}
      <div className="flex flex-col justify-center">
        <h1
          className={`text-2xl font-bold tracking-tight sm:text-3xl ${selected && !isLightBody ? 'text-white/90' : 'text-stone-900'}`}
        >
          Choose Your Team
        </h1>
        <p
          className={`mt-1 text-sm sm:text-base ${selected && !isLightBody ? 'text-white/60' : 'text-stone-500'}`}
        >
          Select the franchise you'll manage this season.
        </p>

        <div className="mt-5 space-y-5 sm:mt-6 sm:space-y-6">
          {conferences.map((conf) => {
            const confTeams = teams?.filter((t) => t.conference === conf.key) ?? [];
            return (
              <section key={conf.key}>
                <h2
                  className={`mb-2.5 text-xs font-bold tracking-[0.15em] sm:mb-3 sm:text-base ${selected && !isLightBody ? 'text-white/70' : 'text-stone-600'}`}
                >
                  {conf.label}
                </h2>

                <div className="space-y-3 sm:space-y-2.5">
                  {conf.divisions.map((div) => {
                    const divTeams = confTeams.filter((t) => t.division === div);
                    return (
                      // A division label beside the chips needs room that only the
                      // desktop rail layout has, so below xl the label sits on its own
                      // line and the chips take the full width in three columns.
                      <div
                        key={div}
                        className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-4"
                      >
                        <span
                          className={`text-sm font-semibold xl:w-28 xl:shrink-0 xl:text-base ${selected && !isLightBody ? 'text-white/60' : 'text-stone-600'}`}
                        >
                          {div}
                        </span>

                        <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5">
                          {divTeams.map((team) => {
                            const isSelected = selected?.abbreviation === team.abbreviation;
                            return (
                              <button
                                key={team.abbreviation}
                                onClick={() =>
                                  setSelected((prev) =>
                                    prev?.abbreviation === team.abbreviation ? null : team,
                                  )
                                }
                                className={`
                                  group relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3
                                  text-center outline-none transition-all duration-300 ease-out
                                  md:gap-2 md:px-3 md:py-4
                                  ${
                                    isSelected
                                      ? 'shadow-lg scale-[1.02] translate-y-px'
                                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                                  }
                                `}
                                style={
                                  isSelected
                                    ? {
                                        backgroundColor: team.primaryColor,
                                        borderColor: '#ffffff',
                                        boxShadow: `0 4px 24px -4px ${team.primaryColor}55`,
                                      }
                                    : undefined
                                }
                              >
                                {/* Checkmark */}
                                <span
                                  aria-hidden="true"
                                  className={`absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] shadow transition-all duration-300 ${
                                    isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                                  }`}
                                  style={{
                                    backgroundColor: isSelected ? '#ffffff' : team.primaryColor,
                                    color: isSelected ? team.primaryColor : '#ffffff',
                                  }}
                                >
                                  ✓
                                </span>
                                {/* Silhouette logo — clipped to card. Off on phones:
                                    behind a small chip's two lines of text it only
                                    muddies them. */}
                                <div className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-2xl md:block">
                                  <Crest
                                    team={team}
                                    className={`absolute -right-4 top-1/2 -translate-y-1/2 h-24 w-24 object-contain grayscale transition-opacity duration-300 md:h-32 md:w-32 ${isSelected ? 'opacity-[0.12]' : 'opacity-[0.05] group-hover:opacity-[0.08]'}`}
                                  />
                                </div>

                                {/* Logo */}
                                <Crest
                                  team={team}
                                  className={`relative z-[1] h-9 w-9 shrink-0 object-contain transition-transform duration-300 md:h-12 md:w-12 ${
                                    isSelected ? 'scale-110' : 'group-hover:scale-105'
                                  }`}
                                />

                                {/* Text. Every chip is a fixed-width grid cell, so the
                                    crest sits above the name rather than beside it: at five
                                    columns there is no room for both on one line, and
                                    beside it the longest names spilled past the card. */}
                                <div className="relative z-[1] w-full min-w-0">
                                  <span
                                    className={`block text-sm font-bold leading-tight md:text-base ${isSelected ? (isLightCard ? 'text-stone-900' : 'text-white') : 'text-stone-800'}`}
                                  >
                                    {team.abbreviation}
                                  </span>
                                  <span
                                    className={`block text-[10px] leading-tight md:text-[13px] ${isSelected ? (isLightCard ? 'text-stone-700' : 'text-white/80') : 'text-stone-500'}`}
                                  >
                                    {team.teamName}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ── Right: Detail Sidebar — always rendered, animated ── */}
      <div
        className={`flex flex-col xl:absolute xl:inset-y-0 xl:right-0 xl:w-[340px] xl:overflow-y-auto transition-all duration-300 ease-out ${
          selected ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'
        }`}
      >
        {selected && (
          // my-auto centres the card in the rail; if the card ever grows taller than the
          // rail the auto margin collapses and shrink-0 keeps its height, so the rail
          // scrolls and the top stays reachable.
          <div className="my-auto flex shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Club-colour band: crest, city, name and division on one line. */}
            <div
              className={`flex items-center gap-3.5 px-6 py-5 ${
                isLightCard ? 'text-stone-900' : 'text-white'
              }`}
              style={{ backgroundColor: selected.primaryColor }}
            >
              <Crest team={selected} className="h-14 w-14 shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                  {selected.city}
                </p>
                <h2 className="font-heading text-[22px] font-bold uppercase leading-tight">
                  {selected.teamName}
                </h2>
                <p className="mt-0.5 text-xs opacity-90">
                  {selected.conference === 'East' ? 'Eastern' : 'Western'} · {selected.division}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 px-6 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                Season Leaders
              </p>

              {/* One tile per category, so a face repeats when one player leads two of them. */}
              <div className="grid grid-cols-3 gap-2">
                {(['pts', 'reb', 'ast'] as const).map((cat) => {
                  const leader = selected.leaders?.[cat] ?? null;
                  const label = { pts: 'PTS', reb: 'REB', ast: 'AST' }[cat];
                  return (
                    <div
                      key={cat}
                      className="flex flex-col items-center gap-1 rounded-[10px] border border-brand-line bg-stone-50 px-0.5 py-2"
                    >
                      {leader?.headshotUrl ? (
                        <Headshot url={leader.headshotUrl} />
                      ) : (
                        <div className="aspect-[260/190] w-full rounded-lg bg-white" />
                      )}
                      <p className="flex items-baseline gap-1">
                        <span className="font-heading text-xl font-semibold leading-none tabular-nums text-brand-ink">
                          {leader ? leader.value.toFixed(1) : '—'}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                          {label}
                        </span>
                      </p>
                      {/* Two lines reserved, so the three tiles stay the same height. */}
                      <p className="line-clamp-2 min-h-[2.9em] w-full text-center text-[10px] leading-[1.35] text-stone-500">
                        {leader?.name ?? ''}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div aria-hidden="true" className="h-px bg-brand-line" />

              <div className="grid grid-cols-2 gap-2.5">
                <Fact icon={<ArenaIcon />} label="Arena" value={selected.arena} />
                <Fact icon={<CoachIcon />} label="Head coach" value={selected.headCoach} />
              </div>

              <button
                onClick={submit}
                disabled={saveTeam.isPending}
                className={`hidden w-full items-center justify-center gap-2 rounded-md px-6 py-3.5 text-base font-bold transition-colors duration-200 xl:flex ${isLightCard ? 'text-stone-900' : 'text-white'} disabled:opacity-60`}
                style={{ backgroundColor: selected.primaryColor }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = '';
                }}
              >
                {saveTeam.isPending ? 'Saving…' : 'Continue'}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </button>

              {saveTeam.isError && <SaveError />}
            </div>
          </div>
        )}
      </div>

      {/* ── Phone: the pick and Continue, pinned to the bottom ──
          The detail card sits below the grid below xl, so its own Continue
          button only renders in the desktop rail. Without this bar the button is
          a full scroll of thirty teams away from the chip you just tapped. */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-line bg-white/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md xl:hidden">
          <div className="flex items-center gap-3 px-4 pt-3">
            <Crest team={selected} className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-sm font-bold uppercase leading-tight tracking-wide text-brand-ink">
                {selected.teamName}
              </p>
              <p className="truncate text-[11px] leading-tight text-stone-500">
                {selected.city} · {selected.division}
              </p>
            </div>
            <button
              onClick={submit}
              disabled={saveTeam.isPending}
              className={`flex shrink-0 items-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold transition-colors duration-200 ${isLightCard ? 'text-stone-900' : 'text-white'} disabled:opacity-60`}
              style={{ backgroundColor: selected.primaryColor }}
            >
              {saveTeam.isPending ? 'Saving…' : 'Continue'}
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          </div>
          {saveTeam.isError && <SaveError />}
        </div>
      )}
    </div>
  );
}

function SaveError() {
  return (
    <p role="alert" className="px-4 pt-2 text-center text-sm font-medium text-red-600">
      Couldn't save your team. Check your connection and try again.
    </p>
  );
}

/**
 * A team's mark for the picker, falling back to the league mark if the CDN
 * cannot be reached. A torn-image glyph in every chip reads as a broken page
 * rather than a missing logo, and this page is all crests.
 */
function Crest({ team, className }: { team: TeamWithLeaders; className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <TeamMark
      logoUrl={failed ? null : team.logoUrl}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** The leaders' headshots, degrading to the same empty tile as a missing one. */
function Headshot({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <div className="aspect-[260/190] w-full rounded-lg bg-white" />;

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      className="aspect-[260/190] w-full rounded-lg bg-white object-contain"
    />
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-stone-400" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">{label}</p>
        {/* Wraps rather than truncates: the longest arena is "Rocket Mortgage FieldHouse". */}
        <p className="text-xs font-medium leading-snug break-words text-stone-700">{value}</p>
      </div>
    </div>
  );
}

function ArenaIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}
