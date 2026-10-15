import { useId, useMemo, useRef, useState } from 'react';
import {
  COURT,
  COURT_MARKINGS,
  ZONES,
  zoneFor,
  zonePath,
  type Attempt,
  type ShotZoneId,
  type ZoneStat,
} from './shotZones';

/** The half court, with a margin so the baseline and half court are not flush. */
const VIEW = { x: -262, y: -420, width: 524, height: 480 };

/**
 * Hot-zone fills, cold to hot: red for worse than the league, green for better.
 *
 * Red-to-green is the shot-chart convention and is what this chart uses. These
 * particular stops are chosen rather than inherited, because the usual picks
 * collapse under the most common colour deficiency: a red-to-green ramp drawn
 * from the obvious hues measures 6.6 end-to-end in CAM02-UCS under deuteranopia,
 * below the ~10 where two colours stop being reliably distinguishable, so "hot
 * here" and "cold here" render as the same olive. This set measures 24.4 — the
 * best of the red-green candidates tested — by separating the ends in lightness
 * as well as hue, which is what survives the deficiency.
 */
const EFFICIENCY_STOPS = ['#A01C33', '#D08C92', '#F5F2EC', '#9BCF94', '#4CAF50'];

/** Percentage points either side of the league average that span the ramp. */
const SPREAD = 10;

/**
 * The rule drawn along each zone boundary, over a white halo.
 *
 * The near-white this replaced cleared only 1.24:1 against the ramp's pale green
 * — less contrast than the two fills on either side have with each other, so a
 * boundary could disappear entirely. No single grey fixes that, because the fills
 * run from cream to dark red: the grey that reads on cream is invisible on the
 * red end, and vice versa. Hence the halo, which is what shows against a dark
 * fill, under this, which is what shows against a light one. Together the pair
 * clears at least 3.4:1 against every stop in the ramp.
 */
const ZONE_BORDER = '#4A443E';

/** The halo behind the boundary rule, and its width. See `ZONE_BORDER`. */
const ZONE_BORDER_HALO = '#FFFFFF';
const ZONE_BORDER_HALO_WIDTH = 3;

function rampColor(stops: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const span = (stops.length - 1) * clamped;
  const low = Math.min(stops.length - 2, Math.floor(span));
  const mix = span - low;
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [parse(stops[low]), parse(stops[low + 1])];
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * mix);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

export interface ShotZoneChartProps {
  /** One entry per zone, as `tallyByZone` returns them. */
  stats: readonly ZoneStat[];
  /**
   * The league's field-goal percentage from each zone, over the same season and
   * season type `stats` covers. This is the baseline the colours mean, and it is
   * supplied by the caller rather than fixed here because the league shoots
   * differently from a spot in different years — a single all-time figure would
   * mark a whole season's shooters as cold against a league they never played in.
   * Null for a zone the league has no attempts in, which is drawn as no data.
   */
  leagueFgPct: Readonly<Record<ShotZoneId, number | null>>;
  /**
   * Raw shot coordinates, when the source has them. Passing them enables the
   * optional dot overlay; the chart needs only the tallies to work.
   */
  attempts?: readonly Attempt[];
  className?: string;
}

/**
 * A player's shot zones on a half court.
 *
 * Every zone is coloured against the league average from that spot, which is
 * what a hot-zone chart means: 40% from the restricted area is dreadful and 40%
 * from the top of the key is excellent, so a raw percentage is not comparable
 * across zones. Each zone carries its own made/attempted and percentage, so the
 * chart reads without a legend. The fills are the zone partition itself — the
 * same predicates that tally the attempts, so the colour and the printed numbers
 * cannot disagree.
 */
export function ShotZoneChart({ stats, leagueFgPct, attempts, className }: ShotZoneChartProps) {
  const [showDots, setShowDots] = useState(false);
  const [hovered, setHovered] = useState<ShotZoneId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hatchId = useId();

  const statById = useMemo(() => new Map(stats.map((s) => [s.id, s])), [stats]);

  const totalFga = stats.reduce((n, s) => n + s.fga, 0);
  const made = stats.reduce((n, s) => n + s.fgm, 0);

  /**
   * How far a zone's rate sits from the league's from the same spot, in that
   * season and season type. Null when either side has nothing to compare: the
   * player has not shot from the zone, or the league has no attempts there.
   */
  const versusLeague = (stat: ZoneStat): number | null => {
    const league = leagueFgPct[stat.id];
    if (stat.fgPct === null || league == null) return null;
    return stat.fgPct - league;
  };

  const fillFor = (id: ShotZoneId): string => {
    const stat = statById.get(id);
    // No attempts is drawn as hatching, not as a mid-ramp colour: the ramp's
    // neutral midpoint is a real value (exactly league average), and conflating
    // the two would read an empty zone as an average one. A zone the league has
    // no baseline for is drawn the same way, because there is nothing to be
    // above or below.
    if (!stat || stat.fga === 0 || stat.fgPct === null) return `url(#${hatchId})`;
    const delta = versusLeague(stat);
    if (delta === null) return `url(#${hatchId})`;
    return rampColor(EFFICIENCY_STOPS, 0.5 + delta / (2 * SPREAD));
  };

  /** Where the pointer is, in court coordinates, or null when it is off-court. */
  const courtPoint = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = VIEW.x + ((event.clientX - rect.left) / rect.width) * VIEW.width;
    const y = -(VIEW.y + ((event.clientY - rect.top) / rect.height) * VIEW.height);
    if (Math.abs(x) > COURT.halfWidth || y < -COURT.rimToBaseline) return null;
    return { x, y };
  };

  const hoveredStat = hovered ? statById.get(hovered) : undefined;
  const hoveredDelta = hoveredStat ? versusLeague(hoveredStat) : null;

  return (
    // The chart fills its container instead of sizing to its own content. The
    // info line below the court changes length as zones are hovered, and a
    // shrink-to-fit box would resize the whole court on every hover.
    <div className={`w-full ${className ?? ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
          FG% vs league average, by zone
        </p>
        {attempts && attempts.length > 0 && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-500">
            <input
              type="checkbox"
              checked={showDots}
              onChange={(event) => setShowDots(event.target.checked)}
              className="h-3.5 w-3.5 accent-brand-navy"
            />
            shots
          </label>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Shot zone chart: ${totalFga} attempts, ${made} made`}
        onMouseMove={(event) => {
          const point = courtPoint(event);
          setHovered(point ? zoneFor(point.x, point.y) : null);
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          {/* "No attempts" is hatched so it cannot be read as a value. */}
          <pattern
            id={hatchId}
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={10} height={10} fill="#F7F5F2" />
            <line x1={0} y1={0} x2={0} y2={10} stroke="#E0DAD2" strokeWidth={4} />
          </pattern>
        </defs>

        {/* The zone partition. Each boundary is drawn as a light halo with a
            dark rule over it, the same trick the labels use: a single stroke
            cannot clear both ends of the ramp, because the fills run from near
            white to dark red and any one grey disappears against one of them. */}
        <g>
          {ZONES.map((zone) => (
            <path
              key={zone.id}
              d={zonePath(zone)}
              fill={fillFor(zone.id)}
              fillRule="evenodd"
              stroke={ZONE_BORDER_HALO}
              strokeWidth={ZONE_BORDER_HALO_WIDTH}
              opacity={hovered && hovered !== zone.id ? 0.75 : 1}
              className="transition-opacity"
            />
          ))}
          {ZONES.map((zone) => (
            <path
              key={`${zone.id}-border`}
              d={zonePath(zone)}
              fill="none"
              fillRule="evenodd"
              stroke={ZONE_BORDER}
              strokeWidth={1}
              opacity={hovered && hovered !== zone.id ? 0.75 : 1}
              className="transition-opacity"
            />
          ))}
        </g>

        {/* Attempts, when the source carried coordinates and the reader asked. */}
        {showDots && attempts && (
          <g>
            {attempts.map((attempt, index) => (
              <circle
                key={index}
                cx={attempt.x}
                cy={-attempt.y}
                r={5}
                fill={attempt.made ? '#0A2250' : 'none'}
                stroke={attempt.made ? 'none' : '#7A746D'}
                strokeWidth={2}
              />
            ))}
          </g>
        )}

        {/* The painted court. */}
        <g fill="none" stroke="#B9B2A9" strokeWidth={2} strokeLinejoin="round">
          {COURT_MARKINGS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>

        {/* Each zone's made/attempted, percentage and share of the player's
            attempts. The white outline keeps the numbers legible on any fill. */}
        {ZONES.flatMap((zone) =>
          zone.labelAt.map((point, index) => {
            const stat = statById.get(zone.id);
            const fga = stat?.fga ?? 0;
            const fgm = stat?.fgm ?? 0;
            const pct = stat?.fgPct ?? null;
            const attemptsLabel = `${fgm}/${fga}`;
            const percentage = pct === null ? '—' : `${pct.toFixed(0)}%`;
            // How much of the season's shot diet came from here. A zone's rate
            // only means as much as the volume behind it, and the share is what
            // says how much that is — a 3-of-5 zone and a 260-of-365 zone cannot
            // read alike.
            const share = totalFga > 0 && fga > 0 ? `${((fga / totalFga) * 100).toFixed(1)}%` : '—';
            const inline = zone.labelLayout === 'inline';
            return (
              <g
                key={`${zone.id}-${index}`}
                transform={`translate(${point[0]} ${-point[1]}) rotate(${
                  zone.labelRotation ?? 0
                }) scale(${zone.labelScale ?? 1})`}
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={hovered && hovered !== zone.id ? 0.3 : 1}
                className="pointer-events-none"
                stroke="#FFFFFF"
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {inline ? (
                  <text fontSize={10} fontWeight={700} fill="#2A2622" strokeWidth={3.2}>
                    {attemptsLabel}
                    <tspan dx={5} fill="#4A443E">
                      {percentage}
                    </tspan>
                    <tspan dx={5} fill="#6E6862">
                      {share}
                    </tspan>
                  </text>
                ) : (
                  <>
                    <text y={-11} fontSize={11} fontWeight={700} fill="#2A2622" strokeWidth={3.5}>
                      {attemptsLabel}
                    </text>
                    <text y={1} fontSize={9} fontWeight={700} fill="#4A443E" strokeWidth={3}>
                      {percentage}
                    </text>
                    <text y={13} fontSize={9} fontWeight={700} fill="#6E6862" strokeWidth={2.6}>
                      {share}
                    </text>
                  </>
                )}
              </g>
            );
          }),
        )}
      </svg>

      {/* The scale, so the colours mean something without a hover. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-stone-600">
        <span className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-widest text-stone-500">Worse</span>
          <span
            className="h-2.5 w-28 rounded-full"
            style={{ background: `linear-gradient(to right, ${EFFICIENCY_STOPS.join(', ')})` }}
            aria-hidden="true"
          />
          <span className="font-bold uppercase tracking-widest text-stone-500">Better</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <rect width="14" height="14" rx="2" fill="#F7F5F2" stroke="#E0DAD2" />
            <line x1="3" y1="11" x2="11" y2="3" stroke="#E0DAD2" strokeWidth="4" />
          </svg>
          <span className="font-bold uppercase tracking-widest text-stone-500">No attempts</span>
        </span>
        {/* Each zone carries three numbers, in this order. Named rather than
            left to be inferred, because the third one is a proportion of the
            whole season and a bare percentage reads as another rate. */}
        <span className="font-bold uppercase tracking-widest text-stone-500">
          Made/att · FG% · share of attempts
        </span>
      </div>

      <div className="mt-1.5 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-600">
        {hoveredStat ? (
          <>
            <span className="font-bold uppercase tracking-widest text-stone-800">
              {hoveredStat.label}
            </span>
            <span>
              {hoveredStat.fgm}/{hoveredStat.fga} FG
            </span>
            <span className="font-bold">
              {hoveredStat.fgPct === null ? '—' : `${hoveredStat.fgPct.toFixed(1)}%`}
            </span>
            {hoveredDelta !== null && (
              <span className={hoveredDelta >= 0 ? 'text-[#2E7D32]' : 'text-[#A01C33]'}>
                {hoveredDelta >= 0 ? '+' : ''}
                {hoveredDelta.toFixed(1)} vs league
              </span>
            )}
            <span className="text-stone-400">
              {totalFga > 0
                ? `${((hoveredStat.fga / totalFga) * 100).toFixed(1)}% of attempts`
                : ''}
            </span>
          </>
        ) : (
          <span className="text-stone-400">
            Each zone is coloured against the league average from that spot.
          </span>
        )}
      </div>
    </div>
  );
}
