import type { LeadersResponse } from '../../lib/api';

type CatKey = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK';

const LABELS: Record<CatKey, string> = {
  PTS: 'PTS',
  REB: 'REB',
  AST: 'AST',
  STL: 'STL',
  BLK: 'BLK',
};

export function LeagueLeadersPanel({
  leaders,
  loading,
}: {
  leaders?: LeadersResponse | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-brand-line bg-white px-5 py-3">
          <div className="h-5 w-56 animate-pulse rounded bg-stone-200" />
          <div className="h-3 w-20 animate-pulse rounded bg-stone-100" />
        </div>
        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3">
              <div className="mb-3 h-4 w-12 animate-pulse rounded bg-stone-100" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((__, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-stone-100" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-24 animate-pulse rounded bg-stone-100" />
                      <div className="h-2 w-12 animate-pulse rounded bg-stone-50" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!leaders) {
    return (
      <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-brand-line bg-white px-5 py-3">
          <h3 className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
            League Leaders{' '}
            <span className="font-sans text-xs font-semibold normal-case tracking-normal text-stone-500">
              Season Long • Per Game
            </span>
          </h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-stone-500">No leaders data available.</p>
        </div>
      </div>
    );
  }

  const cats: CatKey[] = ['PTS', 'REB', 'AST', 'STL', 'BLK'];

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-line bg-white px-5 py-3">
        <h3 className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
          League Leaders{' '}
          <span className="font-sans text-xs font-semibold normal-case tracking-normal text-stone-500">
            {leaders.season} • Season Long • Per Game
          </span>
        </h3>
        <span className="hidden text-xs font-bold uppercase tracking-widest text-stone-400 sm:inline">
          Top 5
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-brand-line sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {cats.map((cat) => {
          const entries = leaders[cat] ?? [];
          return (
            <div key={cat} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-heading text-sm font-black tracking-widest text-brand-navy">
                  {LABELS[cat]}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Per Game
                </span>
              </div>
              <div className="space-y-2">
                {entries.length ? (
                  entries.map((p, i) => (
                    <div
                      key={p.externalId}
                      className={`flex items-center gap-2 ${i === 0 ? 'rounded-lg border bg-stone-50 p-2' : ''}`}
                    >
                      <span
                        className={`w-3 text-center text-xs font-black ${i === 0 ? 'text-brand-gold' : 'text-stone-400'}`}
                      >
                        {i + 1}
                      </span>
                      <img
                        src={p.headshotUrl}
                        alt={p.name}
                        className="h-8 w-8 rounded-full border bg-stone-100 object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-xs font-bold ${i === 0 ? 'text-brand-ink' : 'text-stone-700'}`}
                        >
                          {p.name}
                        </div>
                        <div className="text-[11px] text-stone-500">{p.teamAbbr}</div>
                      </div>
                      <span
                        className={`text-sm font-black ${i === 0 ? 'text-brand-navy' : 'text-stone-700'}`}
                      >
                        {p.value}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs italic text-stone-400">No data</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
