import type { TeamWithLeaders } from '../../lib/api';
import { Panel } from './shared';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-brand-line pt-3">
      <dt className="text-sm font-semibold uppercase tracking-wide text-stone-600">{label}</dt>
      <dd className="text-right text-base font-medium text-brand-ink">{value}</dd>
    </div>
  );
}

export function TeamCard({ team }: { team: TeamWithLeaders }) {
  return (
    <Panel title="My Team">
      <div className="flex flex-col items-center gap-2 px-5 py-5 text-center">
        <img
          src={team.logoUrl}
          alt={`${team.fullName} logo`}
          className="h-24 w-24 object-contain"
        />
        <h3 className="font-heading text-2xl font-semibold text-brand-ink">{team.fullName}</h3>
        <p className="text-base text-stone-500">
          {team.conference === 'East' ? 'Eastern' : 'Western'} Conference · {team.division} Division
        </p>
        <dl className="mt-3 w-full space-y-3 text-left">
          <InfoRow label="Arena" value={team.arena} />
          <InfoRow label="Head Coach" value={team.headCoach} />
        </dl>
      </div>
    </Panel>
  );
}
