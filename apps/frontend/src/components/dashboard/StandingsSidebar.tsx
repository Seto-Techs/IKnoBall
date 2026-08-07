import { conferences, nbaTeams } from '../../config/nba-teams';
import type { StandingEntry } from '../../lib/mock-data';

export function StandingsSidebar({
  selectedAbbr,
  standings,
  className,
}: {
  selectedAbbr: string;
  standings: StandingEntry[];
  className?: string;
}) {
  const standingsByAbbr: Record<string, StandingEntry> = Object.fromEntries(
    standings.map((standing) => [standing.abbr, standing]),
  );

  return (
    <aside
      className={`flex h-[calc(100vh-5rem)] min-h-0 flex-col self-start overflow-y-auto scrollbar-hide rounded-lg border border-brand-line bg-white ${className ?? ''}`}
    >
      <h2 className="px-5 pt-5 font-heading text-2xl font-bold text-brand-ink">CONFERENCE STANDING</h2>
      <div aria-hidden="true" className="mx-5 mt-3 h-px bg-brand-line" />

      <div className="mt-1 pb-4">
        {conferences.map((conf) => {
          const teams = nbaTeams
            .filter((team) => team.conference === conf.key)
            .map((team) => ({
              team,
              standing: standingsByAbbr[team.abbreviation],
            }))
            .sort((a, b) => {
              const aPct = a.standing
                ? a.standing.wins / (a.standing.wins + a.standing.losses || 1)
                : 0;
              const bPct = b.standing
                ? b.standing.wins / (b.standing.wins + b.standing.losses || 1)
                : 0;
              return bPct - aPct;
            });

          return (
            <section key={conf.key} className="mt-4 pb-5">
              <h3 className="px-5 font-heading text-xl font-semibold text-brand-red">{conf.label}</h3>
              <div className="mt-2 flex items-center gap-3 px-5 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-600">
                <span className="w-6 shrink-0 text-right">#</span>
                <span className="min-w-0 flex-1">Team</span>
                <span className="w-16 shrink-0 text-right">W-L</span>
              </div>
              <ul className="mt-1">
                {teams.map(({ team, standing }, index) => {
                  const isPlayoffCutoff = index === 6;
                  const isPlayInCutoff = index === 10;

                  return (
                    <li key={team.abbreviation}>
                      {isPlayoffCutoff && (
                        <div className="mx-5 border-t-2 border-brand-ink/20" />
                      )}
                      {isPlayInCutoff && (
                        <div className="mx-5 border-t border-dashed border-brand-ink/20" />
                      )}
                      <div
                        className={`flex items-center gap-3 px-5 py-2 text-base ${
                          team.abbreviation === selectedAbbr
                            ? 'bg-brand-navy/5 font-semibold text-brand-navy'
                            : 'text-brand-ink'
                        }`}
                      >
                        <span className="w-6 shrink-0 text-right text-sm text-stone-500 tabular-nums">
                          {index + 1}
                        </span>
                        <img
                          src={team.logoUrl}
                          alt=""
                          className="h-6 w-6 shrink-0 object-contain"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-base font-medium">
                          {team.abbreviation}
                        </span>
                        {standing && (
                          <span className="shrink-0 text-sm tabular-nums text-stone-600">
                            {standing.wins}-{standing.losses}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
