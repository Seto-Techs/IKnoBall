import { useMemo, useState } from 'react';
import { LoadingSpinner, Panel } from '../dashboard/shared';
import { ShotZoneChart } from './ShotZoneChart';
import { SeasonPicker, type SeasonOption } from './SeasonPicker';
import { SHOT_ZONE_DEFINITIONS } from './shotZones';
import { usePlayerShotZones, type PlayerSeasonType, type PlayerShotZoneEntry } from '../../lib/api';

export interface ShotZonePanelProps {
  /** The player's internal id, as the detail payload carries it. */
  playerId: string;
}

/** Labels for the season types, as they read in a picker. */
const SEASON_TYPE_LABELS: Record<PlayerSeasonType, string> = {
  regular: 'Regular Season',
  playoffs: 'Playoffs',
  preseason: 'Preseason',
};

/** The order the season-type picker lists them in, so it never reshuffles. */
const SEASON_TYPE_ORDER: PlayerSeasonType[] = ['regular', 'playoffs', 'preseason'];

/**
 * The shot-zone breakdown on a player's page.
 *
 * The endpoint returns twelve zones of makes and attempts and nothing else — no
 * coordinates — so the chart is drawn from the tallies alone. Labels, order and
 * the league baselines come from the shared taxonomy, which is also what the
 * worker classified with, so the picture and the numbers cannot disagree.
 *
 * Two pickers rather than one list: a season and a season type are independent
 * choices, and a single combined list grows with every year the player plays.
 * Each is resolved against what the player actually has, so neither can select
 * its way to an empty chart.
 */
export function ShotZonePanel({ playerId }: ShotZonePanelProps) {
  // Null until the first response names a default, which keeps the panel from
  // requesting a season before it knows which ones exist.
  const [selected, setSelected] = useState<{ season?: string; seasonType?: PlayerSeasonType }>({});

  const { data, isLoading } = usePlayerShotZones(playerId, selected.seasonType, selected.season);

  const available = useMemo(() => data?.available ?? [], [data]);
  const season = selected.season ?? data?.season;
  const seasonType = selected.seasonType ?? data?.seasonType;

  // Seasons the player has anything in, newest first as the API sorts them. No
  // subtitle: a season's total across its types sits confusingly beside the type
  // picker's own figure, and the volume line below carries the real numbers.
  const seasonOptions: SeasonOption[] = useMemo(
    () =>
      [...new Set(available.map((entry) => entry.season))].map((value) => ({
        key: value,
        label: value,
      })),
    [available],
  );

  // Every season type, with the ones this season has nothing for greyed out
  // rather than hidden — a stable list beats one that changes length per year.
  const typeOptions: SeasonOption[] = useMemo(
    () =>
      SEASON_TYPE_ORDER.map((key) => {
        const entry = available.find((e) => e.season === season && e.seasonType === key);
        return {
          key,
          label: SEASON_TYPE_LABELS[key],
          subtitle: entry ? formatVolume(entry.gp, entry.fga) : 'none',
          disabled: !entry,
        };
      }),
    [available, season],
  );

  const current = available.find((e) => e.season === season && e.seasonType === seasonType);

  /** Changing the season keeps the type when that season has it, else its leading one. */
  const changeSeason = (next: string) => {
    const sameType = available.find((e) => e.season === next && e.seasonType === seasonType);
    const leading = available.find((e) => e.season === next);
    setSelected({ season: next, seasonType: sameType?.seasonType ?? leading?.seasonType });
  };

  // The API sends zone ids and numbers; the taxonomy supplies what each zone is
  // called and the order to draw them in.
  const stats =
    data?.zones &&
    SHOT_ZONE_DEFINITIONS.map((zone) => {
      const entry: PlayerShotZoneEntry | undefined = data.zones.find((z) => z.zoneId === zone.id);
      return {
        id: zone.id,
        label: zone.label,
        group: zone.group,
        fga: entry?.fga ?? 0,
        fgm: entry?.fgm ?? 0,
        fgPct: entry?.fgPct ?? null,
      };
    });

  const hasShots = (data?.totalFga ?? 0) > 0;

  return (
    <Panel title="Shot Zones">
      <div className="flex flex-col gap-3 px-5 py-4">
        {available.length > 0 && season && seasonType && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SeasonPicker
                value={season}
                options={seasonOptions}
                onChange={changeSeason}
                ariaLabel="Season"
              />
              <SeasonPicker
                value={seasonType}
                options={typeOptions}
                onChange={(next) => setSelected({ season, seasonType: next as PlayerSeasonType })}
                ariaLabel="Season type"
              />
            </div>
            {/* The volume behind the chart, which is what tells a reader whether
                the percentages below are worth reading. */}
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
              {current ? formatVolume(current.gp, current.fga) : '—'}
            </p>
          </>
        )}

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <p className="text-sm font-semibold text-stone-500">
              No shot-zone breakdown for this player yet.
            </p>
            <p className="max-w-[42ch] text-xs text-stone-400">
              Zones are built from the league's play-by-play feed, which the worker reads as each
              game settles. This player is not covered yet.
            </p>
          </div>
        ) : !hasShots || !stats ? (
          <p className="py-10 text-center text-sm text-stone-400">
            No {data.seasonType} shots on file for this player in {data.season}.
          </p>
        ) : (
          // Held to 85% of the panel: at full width on a wide screen the court
          // and its labels read larger than the rest of the page's type.
          <ShotZoneChart
            stats={stats}
            leagueFgPct={data.leagueFgPct}
            className="mx-auto max-w-[85%]"
          />
        )}
      </div>
    </Panel>
  );
}

/**
 * Games and attempts, e.g. "18 GP · 515 ATT". Games is dropped when the season
 * row has no games played, rather than shown as a dash next to a real number.
 */
function formatVolume(gp: number | null, fga: number): string {
  const attempts = `${fga} ${fga === 1 ? 'attempt' : 'attempts'}`;
  return gp == null ? attempts : `${gp} GP · ${attempts}`;
}
