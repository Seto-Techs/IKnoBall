import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { useTeamRecord, useTeams, useTopPlayers } from '../../lib/api';
import { isLightColor } from '../../lib/color';
import { SafeTeamMark } from './parts';

/**
 * The follow-team card, in the account page's right rail.
 *
 * It used to be a chip in the identity header plus a "Change team" button that
 * went to onboarding. The chips are gone; this card is the whole of the team
 * story, and changing the team still goes to onboarding rather than editing in
 * place — onboarding owns the picker and the save, so there is one write path.
 */
export function TeamRail({ current }: { current: string | null }) {
  const { data: teams } = useTeams();
  const { data: record } = useTeamRecord(current ?? undefined);
  const { data: players } = useTopPlayers(current ?? undefined);

  const team = current ? (teams?.find((t) => t.abbreviation === current) ?? null) : null;
  const accent = team?.primaryColor ?? '#1C4188';
  const onLight = isLightColor(accent);

  return (
    <div className="rounded-lg border border-brand-line bg-white">
      <header className="border-b border-brand-line px-4 py-3">
        <h2 className="font-heading text-lg font-semibold uppercase tracking-wide text-brand-ink">
          My Team
        </h2>
      </header>

      {team ? (
        <div className="px-4 py-4">
          <div
            className="relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-3"
            style={{ backgroundColor: accent }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/95 p-1.5">
              <SafeTeamMark
                logoUrl={team.logoUrl}
                abbr={team.abbreviation}
                alt={team.fullName}
                className="h-full w-full"
              />
            </span>
            <div className="min-w-0">
              <p
                className={`truncate font-heading text-base font-bold uppercase leading-tight tracking-wide ${
                  onLight ? 'text-brand-ink' : 'text-white'
                }`}
              >
                {team.teamName}
              </p>
              <p className={`text-[11px] ${onLight ? 'text-brand-ink/70' : 'text-white/75'}`}>
                {team.conference === 'East' ? 'Eastern' : 'Western'} · {team.division}
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Record" value={record ? `${record.wins}-${record.losses}` : '—'} />
            <Stat label="Top PPG" value={players?.[0] ? players[0].points.toFixed(1) : '—'} />
            <Stat label="Coach" value={team.headCoach} />
            <Stat label="Arena" value={team.arena} />
          </dl>

          <Link
            to="/onboarding"
            className="mt-3 flex w-full items-center justify-between rounded-md border border-brand-line px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-brand-ink transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            Change team
            <ArrowUpRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="text-sm text-stone-500">No team picked yet.</p>
          <Link
            to="/onboarding"
            className="mt-3 flex w-full items-center justify-between rounded-md border border-brand-line px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-brand-ink transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            Pick a team
            <ArrowUpRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 px-2.5 py-2">
      <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">{label}</dt>
      <dd className="truncate text-xs font-semibold text-brand-ink">{value}</dd>
    </div>
  );
}
