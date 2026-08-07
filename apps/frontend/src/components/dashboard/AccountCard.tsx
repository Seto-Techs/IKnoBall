import { User } from 'lucide-react';
import { type NBATeam } from '../../config/nba-teams';
import type { SelectedTeam } from '../../lib/team';
import type { AuthUser } from '../../lib/use-auth';
import { Panel } from './shared';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-brand-line pt-3">
      <dt className="text-sm font-semibold uppercase tracking-wide text-stone-600">{label}</dt>
      <dd className="text-right text-base font-medium text-brand-ink">{value}</dd>
    </div>
  );
}

export function TeamCard({ team, teamInfo }: { team: SelectedTeam; teamInfo?: NBATeam }) {
  return (
    <Panel title="My Team">
      <div className="flex flex-col items-center gap-2 px-5 py-5 text-center">
        <img src={team.logoUrl} alt={`${team.name} logo`} className="h-24 w-24 object-contain" />
        <h3 className="font-heading text-2xl font-semibold text-brand-ink">{team.name}</h3>
        <p className="text-base text-stone-500">
          {teamInfo
            ? `${teamInfo.conference === 'East' ? 'Eastern' : 'Western'} Conference · ${teamInfo.division} Division`
            : team.abbr}
        </p>
        <dl className="mt-3 w-full space-y-3 text-left">
          <InfoRow label="Arena" value={teamInfo?.arena ?? '—'} />
          <InfoRow label="Head Coach" value={teamInfo?.headCoach ?? '—'} />
        </dl>
      </div>
    </Panel>
  );
}

export function AccountCard({
  user,
  onChooseTeam,
  onSignOut,
}: {
  user?: AuthUser;
  onChooseTeam: () => void;
  onSignOut: () => void;
}) {
  return (
    <Panel title="Account">
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-navy text-lg font-semibold text-white"
          aria-hidden="true"
        >
          {user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-6 w-6" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-brand-ink">{user?.name ?? 'Guest'}</p>
          <p className="truncate text-sm text-stone-500">{user?.email ?? 'Not signed in'}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={onChooseTeam}
          className="rounded-md bg-brand-navy px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-brand-navyDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        >
          Change Team
        </button>
        <button
          onClick={onSignOut}
          className="rounded-md border-2 border-brand-line px-4 py-2.5 text-base font-medium text-brand-ink transition-colors hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
        >
          Sign out
        </button>
      </div>
    </Panel>
  );
}
