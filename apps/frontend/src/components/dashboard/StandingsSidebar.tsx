import type { StandingsResponse } from '../../lib/api';
import { LoadingSpinner } from './shared';

export function StandingsSidebar({
  selectedAbbr,
  standings,
  loading = false,
  className,
}: {
  selectedAbbr: string;
  standings: StandingsResponse | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={`flex h-[calc(100vh-5rem)] min-h-0 flex-col self-start overflow-y-auto scrollbar-hide rounded-lg border border-brand-line bg-white ${className ?? ''}`}
    >
      <h2 className="px-5 pt-5 font-heading text-2xl font-bold text-brand-ink">
        CONFERENCE STANDING
      </h2>
      <div aria-hidden="true" className="mx-5 mt-3 h-px bg-brand-line" />

      {loading ? (
        <div className="py-10">
          <LoadingSpinner />
        </div>
      ) : !standings ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">Couldn't load standings.</p>
      ) : (
        <div className="mt-1 pb-4">
          {(['West', 'East'] as const).map((conf) => (
            <section key={conf} className="mt-4 pb-5">
              <h3 className="flex items-center gap-2 border-b border-brand-line px-5 pb-2 font-heading text-lg font-bold uppercase tracking-wider">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm ${conf === 'West' ? 'bg-brand-red' : 'bg-brand-navy'}`}
                />
                <span className={conf === 'West' ? 'text-brand-red' : 'text-brand-navy'}>
                  {conf === 'West' ? 'Western' : 'Eastern'} Conference
                </span>
              </h3>
              <div className="mt-2 flex items-center gap-3 px-5 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-600">
                <span className="w-6 shrink-0 text-right">#</span>
                <span className="min-w-0 flex-1">Team</span>
                <span className="w-16 shrink-0 text-right">W-L</span>
              </div>
              <ul className="mt-1">
                {standings[conf].map((row) => (
                  <li key={row.teamAbbr}>
                    <div
                      className={`flex items-center gap-3 px-5 py-2 text-base ${
                        row.teamAbbr === selectedAbbr
                          ? 'bg-brand-navy/5 font-semibold text-brand-navy'
                          : 'text-brand-ink'
                      }`}
                    >
                      <span className="w-6 shrink-0 text-right text-sm text-stone-500 tabular-nums">
                        {row.rank}
                      </span>
                      <img
                        src={row.logoUrl}
                        alt=""
                        className="h-6 w-6 shrink-0 object-contain"
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-base font-medium">{row.teamAbbr}</span>
                        {row.marker && (
                          <span className="shrink-0 rounded bg-stone-100 px-1 py-0.5 text-[11px] font-bold text-stone-500">
                            {row.marker}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-stone-600">
                        {row.wins}-{row.losses}
                      </span>
                    </div>
                    {row.rank === 6 && (
                      <div className="mx-5 border-t border-dashed border-brand-ink/20" />
                    )}
                    {row.rank === 10 && <div className="mx-5 border-t-2 border-brand-ink/20" />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
