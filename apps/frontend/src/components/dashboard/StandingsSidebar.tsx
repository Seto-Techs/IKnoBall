import type { StandingsResponse } from '../../lib/api';
import { darken, isLightColor } from '../../lib/color';
import { LoadingSpinner } from './shared';

export function StandingsSidebar({
  selectedAbbr,
  standings,
  loading = false,
  className,
  selectedColor,
}: {
  selectedAbbr: string;
  standings: StandingsResponse | null;
  loading?: boolean;
  className?: string;
  selectedColor?: string;
}) {
  return (
    <aside
      className={`flex h-fit flex-col self-start rounded-lg border border-brand-line bg-white xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain [scrollbar-width:thin] [scrollbar-color:#d6d3d1_transparent] ${className ?? ''}`}
    >
      <div className="sticky top-0 z-10 rounded-t-lg bg-white px-5 pb-3 pt-5">
        <h2 className="font-heading text-2xl font-bold text-brand-ink">CONFERENCE STANDING</h2>
        <div aria-hidden="true" className="mt-3 h-px bg-brand-line" />
      </div>

      {loading ? (
        <div className="py-10">
          <LoadingSpinner />
        </div>
      ) : !standings ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">Couldn't load standings.</p>
      ) : (
        <div className="pb-4">
          {(() => {
            const order: ('West' | 'East')[] = standings.West.some(
              (r) => r.teamAbbr === selectedAbbr,
            )
              ? ['West', 'East']
              : ['East', 'West'];
            return order.map((conf) => (
              <section key={conf} className="pb-5">
                <div className="sticky top-[77px] z-[9] bg-white pt-4">
                  <h3 className="flex items-center gap-2 border-b border-brand-line px-5 pb-2 font-heading text-lg font-bold uppercase tracking-wider">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-sm ${conf === 'West' ? 'bg-brand-red' : 'bg-brand-navy'}`}
                    />
                    <span className={conf === 'West' ? 'text-brand-red' : 'text-brand-navy'}>
                      {conf === 'West' ? 'Western' : 'Eastern'} Conference
                    </span>
                  </h3>
                  <div className="mt-2 flex items-center gap-3 bg-white px-5 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-600">
                    <span className="w-6 shrink-0 text-right">#</span>
                    <span className="min-w-0 flex-1">Team</span>
                    <span className="w-16 shrink-0 text-right">W-L</span>
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {standings[conf].map((row) => {
                    const isSelected = row.teamAbbr === selectedAbbr;
                    const isLightSelected =
                      isSelected && !!selectedColor && isLightColor(selectedColor);
                    const lightBg = isLightSelected ? `${darken(selectedColor!, 0.42)}1A` : null;
                    const lightFg = isLightSelected ? darken(selectedColor!, 0.58) : null;
                    return (
                      <li key={row.teamAbbr}>
                        <div
                          className={`relative flex items-center gap-3 px-5 py-2 text-base transition-colors duration-200 ${
                            isSelected ? 'font-semibold' : 'text-brand-ink'
                          }`}
                          style={
                            isSelected && selectedColor
                              ? isLightSelected
                                ? {
                                    backgroundColor: lightBg!,
                                    color: lightFg!,
                                  }
                                : {
                                    backgroundColor: `${selectedColor}1A`,
                                    color: selectedColor,
                                  }
                              : undefined
                          }
                        >
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-[5px] bottom-[5px] w-0.5 rounded-full"
                              style={{
                                backgroundColor: isLightSelected ? lightFg! : selectedColor,
                              }}
                            />
                          )}
                          <span
                            className={`w-6 shrink-0 text-right text-sm tabular-nums ${
                              isSelected
                                ? isLightSelected
                                  ? 'text-stone-500'
                                  : 'text-stone-500'
                                : 'text-stone-500'
                            }`}
                          >
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
                              <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[11px] font-bold ${
                                  isSelected && isLightSelected
                                    ? 'bg-stone-200 text-stone-700 ring-1 ring-stone-300'
                                    : 'bg-stone-100 text-stone-500'
                                }`}
                              >
                                {row.marker}
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 text-sm tabular-nums ${
                              isSelected ? 'text-stone-600' : 'text-stone-600'
                            }`}
                          >
                            {row.wins}-{row.losses}
                          </span>
                        </div>
                        {row.rank === 6 && (
                          <div className="mx-5 border-t border-dashed border-brand-ink/20" />
                        )}
                        {row.rank === 10 && <div className="mx-5 border-t-2 border-brand-ink/20" />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ));
          })()}
        </div>
      )}
    </aside>
  );
}
