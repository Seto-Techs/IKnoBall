import { GiCrown } from 'react-icons/gi';
import { nbaTeams } from '../../config/nba-teams';
import type { PlayerStat } from '../../lib/api';
import { Panel, LoadingSpinner, EmptyState } from './shared';

/* All-around score: the sum of the three headline stats. */
const composite = (p: PlayerStat) => p.points + p.rebounds + p.assists;

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand-line px-2 py-2 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold leading-none tabular-nums text-brand-ink">
        {value}
      </p>
    </div>
  );
}

/**
 * Team view hero: the team's leading player, picked by the best all-around
 * stat line (points + rebounds + assists) across the roster.
 */
export function TeamLeaderPanel({
  players,
  loading = false,
}: {
  players?: PlayerStat[];
  loading?: boolean;
}) {
  const leader = [...(players ?? [])].sort((a, b) => composite(b) - composite(a))[0];
  const teamName = leader?.team
    ? nbaTeams.find((t) => t.abbreviation === leader.team)?.fullName
    : undefined;

  return (
    <Panel title="Team Leader">
      {loading ? (
        <LoadingSpinner />
      ) : leader ? (
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="relative mx-auto w-36 shrink-0 overflow-hidden rounded-lg border border-brand-line sm:mx-0">
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-brand-navy/5">
              <span className="font-heading text-5xl font-semibold text-brand-navy/15">
                {leader.name.charAt(0)}
              </span>
              {leader.imageUrl && (
                <img
                  src={leader.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>
            <span
              className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-brand-gold"
              aria-hidden="true"
            >
              <GiCrown className="h-4 w-4 text-brand-navyDark" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-2.5 py-0.5 text-sm font-bold text-brand-navyDark">
              <GiCrown className="h-4 w-4" aria-hidden="true" />
              Team Leader
            </span>
            <h3 className="mt-2 font-heading text-2xl font-semibold leading-tight text-brand-ink">
              {leader.name}
            </h3>
            <p className="text-base text-stone-500">
              {leader.position}
              {teamName ? ` · ${teamName}` : ''}
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <StatBlock label="PTS" value={leader.points.toFixed(1)} />
              <StatBlock label="REB" value={leader.rebounds.toFixed(1)} />
              <StatBlock label="AST" value={leader.assists.toFixed(1)} />
            </dl>

            <p className="mt-3 text-sm text-stone-600">
              Best all-around on the team this season.
            </p>
          </div>
        </div>
      ) : (
        <EmptyState message="No player stats for this team." />
      )}
    </Panel>
  );
}
