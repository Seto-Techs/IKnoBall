import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useMemo } from 'react';
import { isLightColor, darken } from '../lib/color';
import { useSaveTeam, useTeams, type TeamWithLeaders } from '../lib/api';
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

  return (
    <div
      className="relative grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]"
      style={{ minHeight: 'calc(100vh - 80px)' }}
    >
      {/* ── Left: Team Grid ─────────────────────────────────── */}
      <div className="flex flex-col justify-center">
        <h1
          className={`text-3xl font-bold tracking-tight ${selected && !isLightBody ? 'text-white/90' : 'text-stone-900'}`}
        >
          Choose Your Team
        </h1>
        <p
          className={`mt-1 text-base ${selected && !isLightBody ? 'text-white/60' : 'text-stone-500'}`}
        >
          Select the franchise you'll manage this season.
        </p>

        <div className="mt-6 space-y-6">
          {conferences.map((conf) => {
            const confTeams = teams?.filter((t) => t.conference === conf.key) ?? [];
            return (
              <section key={conf.key}>
                <h2
                  className={`mb-3 text-base font-bold tracking-[0.15em] ${selected && !isLightBody ? 'text-white/70' : 'text-stone-600'}`}
                >
                  {conf.label}
                </h2>

                <div className="space-y-2.5">
                  {conf.divisions.map((div) => {
                    const divTeams = confTeams.filter((t) => t.division === div);
                    return (
                      <div key={div} className="flex items-center gap-4">
                        <span
                          className={`w-28 shrink-0 text-base font-semibold ${selected && !isLightBody ? 'text-white/60' : 'text-stone-600'}`}
                        >
                          {div}
                        </span>

                        <div className="grid flex-1 grid-cols-5 gap-3">
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
                                  group relative flex items-center gap-3 rounded-2xl border-2 px-4 py-5
                                  text-left outline-none transition-all duration-300 ease-out
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
                                {/* Silhouette logo — clipped to card */}
                                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                                  <img
                                    src={team.logoUrl}
                                    alt=""
                                    className={`absolute -right-4 top-1/2 -translate-y-1/2 h-32 w-32 object-contain grayscale transition-opacity duration-300 ${isSelected ? 'opacity-[0.12]' : 'opacity-[0.05] group-hover:opacity-[0.08]'}`}
                                  />
                                </div>

                                {/* Logo */}
                                <img
                                  src={team.logoUrl}
                                  alt={team.fullName}
                                  className={`relative z-[1] h-12 w-12 shrink-0 object-contain transition-transform duration-300 ${
                                    isSelected ? 'scale-110' : 'group-hover:scale-105'
                                  }`}
                                  loading="lazy"
                                />

                                {/* Text */}
                                <div className="relative z-[1] min-w-0">
                                  <span
                                    className={`block text-lg font-bold leading-tight ${isSelected ? (isLightCard ? 'text-stone-900' : 'text-white') : 'text-stone-800'}`}
                                  >
                                    {team.abbreviation}
                                  </span>
                                  <span
                                    className={`block text-base leading-tight ${isSelected ? (isLightCard ? 'text-stone-700' : 'text-white/80') : 'text-stone-500'}`}
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
        className={`lg:absolute lg:inset-y-0 lg:right-0 lg:w-[340px] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 ease-out ${
          selected ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'
        }`}
      >
        {selected && (
          <div className="flex h-full flex-col gap-2 py-3">
            {/* Logo */}
            <div className="flex justify-center">
              <img
                src={selected.logoUrl}
                alt={selected.fullName}
                className="h-36 w-36 object-contain"
              />
            </div>

            {/* City + Team name */}
            <h3 className="mt-4 text-center text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">
              {selected.city}
            </h3>
            <h2 className="text-center text-2xl font-extrabold uppercase tracking-tight text-stone-900">
              {selected.teamName}
            </h2>

            {/* Conference / Division */}
            <div className="mt-3 flex flex-col items-center gap-1.5 text-sm text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-stone-400" />
                {selected.conference === 'East' ? 'Eastern' : 'Western'} Conference
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: selected.primaryColor }}
                />
                {selected.division} Division
              </span>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Info pills */}
            <div className="flex flex-col items-center gap-2 text-center">
              <InfoPill
                label="CONFERENCE"
                value={selected.conference === 'East' ? 'Eastern' : 'Western'}
              />
              <InfoPill label="DIVISION" value={selected.division} />
              <InfoPill label="CODE" value={selected.abbreviation} />
            </div>

            {/* Stat Leaders */}
            {selected.leaders && (
              <>
                <div className="h-px bg-gray-100" />
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-400">
                    2025-26 Leaders
                  </p>
                  <div className="w-full space-y-1.5">
                    {(['pts', 'reb', 'ast'] as const).map((cat) => {
                      const s = selected.leaders![cat];
                      const label = { pts: 'PTS', reb: 'REB', ast: 'AST' }[cat];
                      return (
                        <div
                          key={cat}
                          className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2"
                        >
                          <span className="w-7 text-center text-xs font-bold text-stone-400">
                            {label}
                          </span>
                          <span className="text-sm font-medium text-stone-700 truncate">
                            {s.name}
                          </span>
                          <span className="ml-auto text-sm font-semibold tabular-nums text-stone-900">
                            {s.value.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="h-px bg-gray-100" />

            {/* Arena */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100">
                <svg
                  className="h-4 w-4 text-stone-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-stone-400">
                  Arena
                </p>
                <p className="text-base font-medium text-stone-700">{selected.arena}</p>
              </div>
            </div>

            {/* Head Coach */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100">
                <svg
                  className="h-4 w-4 text-stone-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-stone-400">
                  Head Coach
                </p>
                <p className="text-base font-medium text-stone-700">{selected.headCoach}</p>
              </div>
            </div>

            {/* Spacer — pushes button to bottom */}
            <div className="flex-1" />

            {/* Continue button */}
            <button
              onClick={() => {
                if (saveTeam.isPending) return;
                saveTeam.mutate(selected.abbreviation, {
                  onSuccess: () => navigate({ to: '/dashboard' }),
                });
              }}
              disabled={saveTeam.isPending}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-colors duration-200 ${isLightCard ? 'text-stone-900' : 'text-white'} disabled:opacity-60`}
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

            {saveTeam.isError && (
              <p className="text-center text-sm font-medium text-red-600">
                Couldn't save your team. Check your connection and try again.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <span className="mt-1 inline-block rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm font-medium text-stone-700">
        {value}
      </span>
    </div>
  );
}
