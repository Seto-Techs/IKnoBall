import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CalendarClock, UserRound } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { Panel } from '../components/dashboard/shared';
import { useTeamRecord, useTeams, useTopPlayers } from '../lib/api';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

/**
 * The account page: who you are and which team you follow.
 *
 * Everything about picks lives on `/predict` — the record cards and pick history
 * that used to sit here are now the Slate and My Picks tabs there, so this page
 * does not duplicate them.
 */
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

          {/* ── Team ── */}
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
                  {team.conference === 'East' ? 'Eastern' : 'Western'} Conference · {team.division}
                </p>
              </div>
            </div>
            {/* Four stats, so they spread across the full width rather than
                leaving the right half of the page empty. */}
            <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
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
                <p className="truncate text-sm font-semibold text-brand-ink">{team.headCoach}</p>
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
        </div>
      </div>
    </div>
  );
}
