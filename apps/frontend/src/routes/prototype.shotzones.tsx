import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ShotZoneChart } from '../components/playerDetail/ShotZoneChart';
import { SAMPLE_ATTEMPTS } from '../components/playerDetail/shotZoneSample';
import { ZONES, ZONE_RULES, tallyByZone } from '../components/playerDetail/shotZones';

/**
 * Dev-only preview of the shot-zone chart. The real player page draws the chart
 * from the shot-zone endpoint's tallies, which carry no coordinates — so this is
 * the only place the optional shot-dot overlay can be exercised, and the only
 * place the zone boundaries are listed next to the numbers they produce.
 *
 * Safe to delete, along with the /prototype/shotzones route.
 */
export const Route = createFileRoute('/prototype/shotzones')({
  component: PrototypeShotZones,
});

function PrototypeShotZones() {
  const stats = useMemo(() => tallyByZone(SAMPLE_ATTEMPTS), []);
  const totalFga = stats.reduce((n, s) => n + s.fga, 0);
  const totalFgm = stats.reduce((n, s) => n + s.fgm, 0);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold uppercase tracking-widest text-brand-navyDark">
          Shot zones
        </h1>
        <p className="text-xs text-stone-500">
          {SAMPLE_ATTEMPTS.length} sample attempts · shot dots, zone table and boundaries
        </p>
      </div>

      <div className="rounded-xl border border-brand-line bg-white p-4">
        <ShotZoneChart stats={stats} attempts={SAMPLE_ATTEMPTS} className="mx-auto max-w-[720px]" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-stone-100 text-[11px] uppercase tracking-widest text-stone-500">
            <tr>
              <th className="px-4 py-2 font-bold">Zone</th>
              <th className="px-4 py-2 font-bold">Boundary</th>
              <th className="px-4 py-2 text-right font-bold">FGA</th>
              <th className="px-4 py-2 text-right font-bold">FGM</th>
              <th className="px-4 py-2 text-right font-bold">FG%</th>
            </tr>
          </thead>
          <tbody>
            {ZONES.map((zone, index) => {
              const stat = stats[index];
              return (
                <tr key={zone.id} className="border-t border-brand-line">
                  <td className="px-4 py-2 font-semibold text-stone-800">{zone.label}</td>
                  <td className="px-4 py-2 text-stone-500">{ZONE_RULES[zone.id]}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stat.fga}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stat.fgm}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold">
                    {stat.fgPct === null ? '—' : `${stat.fgPct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
              <td className="px-4 py-2">All zones</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right tabular-nums">{totalFga}</td>
              <td className="px-4 py-2 text-right tabular-nums">{totalFgm}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {totalFga === 0 ? '—' : `${((totalFgm / totalFga) * 100).toFixed(1)}%`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
