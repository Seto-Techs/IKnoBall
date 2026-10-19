import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CalendarClock } from 'lucide-react';
import { DashboardHeader } from '../components/dashboard/Header';
import { TeamRail } from '../components/profile/TeamRail';
import { ConnectionsSection } from '../components/profile/ConnectionsSection';
import {
  IdentitySection,
  LegalSection,
  PasswordSection,
  SessionsSection,
} from '../components/profile/sections';
import { Avatar } from '../components/profile/parts';
import { useAccounts } from '../lib/use-account';
import { useTeams } from '../lib/api';
import { useSession, useSignOut } from '../lib/use-auth';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

/**
 * The account page: who you are, how you sign in, and which team you follow.
 *
 * Picks live on `/predict` — the record cards and pick history that used to sit
 * here are the Slate and My Picks tabs there, so this page does not duplicate
 * them. The team is a summary in the right rail; changing it hands off to
 * `/onboarding`, which owns the picker and the save.
 *
 * Every write goes through Better Auth: `update-user` persists the display name
 * and avatar, `change-password` and `list-sessions` back the security section,
 * and `list-accounts` backs the connected accounts. Changing email is shown as
 * unavailable because the server disables it (`CHANGE_EMAIL_DISABLED`).
 */
function ProfilePage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading, isFetching: sessionFetching } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  const { data: teams } = useTeams({ enabled: !!user });
  const { data: accounts } = useAccounts(!!user);

  const team = user?.favoriteTeam
    ? (teams?.find((t) => t.abbreviation === user.favoriteTeam) ?? null)
    : null;
  const accentColor = team?.primaryColor ?? '#1C4188';
  const hasPassword = (accounts ?? []).some((a) => a.providerId === 'credential');

  useEffect(() => {
    if (sessionLoading || sessionFetching) return;
    if (!user) navigate({ to: '/auth/login' });
    else if (!user.favoriteTeam) navigate({ to: '/onboarding' });
  }, [sessionLoading, sessionFetching, user, navigate]);

  if (sessionLoading || sessionFetching) return null;
  if (!user) return null;

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: '/' }) });
  };

  return (
    <div className="min-h-screen bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor={accentColor}
        onSignOut={handleSignOut}
        active="profile"
      />

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6">
          <IdentityHeader
            name={user.name}
            email={user.email}
            image={user.image}
            accentColor={accentColor}
            teamName={team?.teamName ?? null}
            teamAbbr={team?.abbreviation ?? null}
            conference={team?.conference ?? null}
            division={team?.division ?? null}
            createdAt={user.createdAt}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* The rail leads on narrow screens: which team you follow is the one
                thing worth seeing before a long settings column, and the desktop
                rail sits to the right regardless of source order. */}
            <aside className="order-first flex flex-col gap-5 lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
              <TeamRail current={user.favoriteTeam ?? null} />
            </aside>

            <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
              <IdentitySection
                name={user.name}
                email={user.email}
                image={user.image}
                verified={user.emailVerified}
              />
              <PasswordSection hasPassword={hasPassword} />
              <SessionsSection currentToken={session?.session.token} />
              <ConnectionsSection enabled={!!user} />
              <LegalSection />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The identity banner. Team chips and "Change Team" moved to the rail, so this
 * carries the name, the email and the member-since line.
 */
function IdentityHeader({
  name,
  email,
  image,
  accentColor,
  teamName,
  teamAbbr,
  conference,
  division,
  createdAt,
}: {
  name: string;
  email: string;
  image: string | null;
  accentColor: string;
  teamName: string | null;
  teamAbbr: string | null;
  conference: string | null;
  division: string | null;
  createdAt: string;
}) {
  return (
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
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-6 sm:flex-row sm:gap-5 sm:px-8">
        <Avatar name={name} image={image} size={80} className="shadow-xl ring-4 ring-white/30" />
        <div className="min-w-0 text-center sm:text-left">
          <h1 className="font-heading text-3xl font-black uppercase tracking-wide text-white sm:text-4xl">
            {name}
          </h1>
          <p className="mt-0.5 text-sm text-white/80">{email}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {teamName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
                {teamName} · {teamAbbr}
              </span>
            )}
            {conference && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
                {conference === 'East' ? 'Eastern' : 'Western'} · {division}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ring-1 ring-white/20 backdrop-blur">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              Member since {new Date(createdAt).getFullYear() || '2026'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
