/**
 * The half-court shot-zone taxonomy.
 *
 * This is the single source of truth for what each zone means and which zone an
 * attempt belongs to. It is shared because two very different callers have to
 * agree on it: the worker classifies every shot in a season to produce tallies,
 * and the web app draws the same partition and prints the same numbers. When
 * those two drifted apart they did so silently — the chart looked right while
 * the percentages came from a different set of boundaries.
 *
 * Deliberately free of any drawing geometry. The outlines, label positions and
 * court markings live with the chart, because the worker has no use for them and
 * they would only bloat what it has to load.
 *
 * Every measurement is in the shot feed's own unit: tenths of a foot, with the
 * centre of the rim at the origin, +x to the shooter's right and +y towards half
 * court. That is the frame `stats.nba.com/stats/shotchartdetail` reports as
 * `LOC_X`/`LOC_Y` and the CDN play-by-play reports as `xLegacy`/`yLegacy`, so a
 * shot from either source drops straight in with no conversion.
 */

/** Court measurements in tenths of a foot, with the rim centre at the origin. */
export const COURT = {
  /** Rim centre to the baseline. */
  rimToBaseline: 52.5,
  /** Rim centre to half court; the floor is 94 ft, so half court is 47 ft out. */
  halfCourtY: 417.5,
  /** Half of the 50 ft width. */
  halfWidth: 250,
  /** Half of the 16 ft lane. */
  paintHalfWidth: 80,
  /** The free-throw line, 19 ft from the baseline. */
  freeThrowLineY: 137.5,
  /** The 4 ft no-charge arc. */
  restrictedRadius: 40,
  /** The 23 ft 9 in arc. */
  threeRadius: 237.5,
  /** The 22 ft corner line. */
  cornerThreeX: 220,
  /** Attempts from 30 ft and out read as deep threes. */
  deepThreeRadius: 300,
  /** Above the break, up to this angle from the rim reads as the top of the key. */
  topOfKeyAngle: 20,
} as const;

/** Where the corner line meets the arc: sqrt(237.5² - 220²) = 89.5. */
export const CORNER_JOIN_Y = Math.sqrt(COURT.threeRadius ** 2 - COURT.cornerThreeX ** 2);

export type ShotZoneGroup = 'paint' | 'midRange' | 'three';

export type ShotZoneId =
  | 'restrictedArea'
  | 'paint'
  | 'baselineMidLeft'
  | 'baselineMidRight'
  | 'elbowMidLeft'
  | 'elbowMidRight'
  | 'cornerThreeLeft'
  | 'cornerThreeRight'
  | 'wingThreeLeft'
  | 'wingThreeRight'
  | 'topOfKeyThree'
  | 'deepThree';

export interface ShotZoneDefinition {
  id: ShotZoneId;
  /** Full name, for a legend or a tooltip. */
  label: string;
  /** What fits inside the region on a chart. */
  shortLabel: string;
  group: ShotZoneGroup;
  /** The zone's boundary in plain words, written from the constants above. */
  rule: string;
}

/**
 * The zones, in the order a chart should read them: paint, then mid-range, then
 * the three-point bands from the corners outwards.
 */
export const SHOT_ZONE_DEFINITIONS: readonly ShotZoneDefinition[] = [
  {
    id: 'restrictedArea',
    label: 'Restricted area',
    shortLabel: 'RA',
    group: 'paint',
    rule: `Inside the ${COURT.restrictedRadius / 10} ft no-charge arc`,
  },
  {
    id: 'paint',
    label: 'Paint',
    shortLabel: 'Paint',
    group: 'paint',
    rule: `The ${COURT.paintHalfWidth / 5} ft lane, outside the no-charge arc`,
  },
  {
    id: 'baselineMidLeft',
    label: 'Baseline mid-range, left',
    shortLabel: 'Base L',
    group: 'midRange',
    rule: 'Left of the lane, below the free-throw line, inside the arc',
  },
  {
    id: 'baselineMidRight',
    label: 'Baseline mid-range, right',
    shortLabel: 'Base R',
    group: 'midRange',
    rule: 'Right of the lane, below the free-throw line, inside the arc',
  },
  {
    id: 'elbowMidLeft',
    label: 'Elbow mid-range, left',
    shortLabel: 'Elbow L',
    group: 'midRange',
    rule: 'Left half of the floor above the free-throw line, inside the arc',
  },
  {
    id: 'elbowMidRight',
    label: 'Elbow mid-range, right',
    shortLabel: 'Elbow R',
    group: 'midRange',
    rule: 'Right half of the floor above the free-throw line, inside the arc',
  },
  {
    id: 'cornerThreeLeft',
    label: 'Left corner three',
    shortLabel: 'Corner L',
    group: 'three',
    rule: `Left of the ${COURT.cornerThreeX / 10} ft corner line`,
  },
  {
    id: 'cornerThreeRight',
    label: 'Right corner three',
    shortLabel: 'Corner R',
    group: 'three',
    rule: `Right of the ${COURT.cornerThreeX / 10} ft corner line`,
  },
  {
    id: 'wingThreeLeft',
    label: 'Left wing three',
    shortLabel: 'Wing L',
    group: 'three',
    rule: 'Past the arc on the left, wider than the top of the key',
  },
  {
    id: 'wingThreeRight',
    label: 'Right wing three',
    shortLabel: 'Wing R',
    group: 'three',
    rule: 'Past the arc on the right, wider than the top of the key',
  },
  {
    id: 'topOfKeyThree',
    label: 'Top of the key three',
    shortLabel: 'Top Key',
    group: 'three',
    rule: `Past the arc, within ${COURT.topOfKeyAngle}° of straight-on`,
  },
  {
    id: 'deepThree',
    label: 'Deep three',
    shortLabel: 'Deep',
    group: 'three',
    rule: `Beyond ${COURT.deepThreeRadius / 10} ft, anywhere`,
  },
];

export const SHOT_ZONE_IDS: readonly ShotZoneId[] = SHOT_ZONE_DEFINITIONS.map((z) => z.id);

export interface Attempt {
  x: number;
  y: number;
  made: boolean;
}

function angleFromRim(x: number, y: number): number {
  return Math.abs((Math.atan2(x, y) * 180) / Math.PI);
}

function distanceFromRim(x: number, y: number): number {
  return Math.hypot(x, y);
}

/**
 * Past the three-point line. The corner is a straight line 22 ft from the rim,
 * so it is measured off |x|; everywhere else the boundary is the 23.75 ft arc.
 * A corner attempt sits closer to the rim than the arc does, which is why the
 * two cases cannot be collapsed into a single distance test.
 */
function beyondThreeLine(x: number, y: number): boolean {
  if (Math.abs(x) >= COURT.cornerThreeX && y <= CORNER_JOIN_Y) return true;
  return distanceFromRim(x, y) >= COURT.threeRadius;
}

/**
 * The zone an attempt at this point belongs to.
 *
 * The zones are a partition: exactly one zone claims any point on the half
 * court, so a chart can never leave a shot unplaced or count it twice. The
 * checks run most-specific-first — the restricted area is tested before the
 * lane, because it sits inside it — and keeping the whole decision in one
 * function is what makes that ordering auditable, rather than spread across a
 * list of independent predicates where it would be invisible.
 */
export function zoneFor(x: number, y: number): ShotZoneId {
  const distance = distanceFromRim(x, y);
  const angle = angleFromRim(x, y);

  if (distance <= COURT.restrictedRadius) return 'restrictedArea';

  if (
    Math.abs(x) <= COURT.paintHalfWidth &&
    y >= -COURT.rimToBaseline &&
    y <= COURT.freeThrowLineY
  ) {
    return 'paint';
  }

  if (!beyondThreeLine(x, y)) {
    if (y <= COURT.freeThrowLineY) return x < 0 ? 'baselineMidLeft' : 'baselineMidRight';
    return x < 0 ? 'elbowMidLeft' : 'elbowMidRight';
  }

  if (Math.abs(x) >= COURT.cornerThreeX && y <= CORNER_JOIN_Y) {
    return x < 0 ? 'cornerThreeLeft' : 'cornerThreeRight';
  }

  if (distance >= COURT.deepThreeRadius) return 'deepThree';
  if (angle <= COURT.topOfKeyAngle) return 'topOfKeyThree';
  return x < 0 ? 'wingThreeLeft' : 'wingThreeRight';
}

export interface ZoneTally {
  id: ShotZoneId;
  label: string;
  group: ShotZoneGroup;
  /** Attempts from the zone. */
  fga: number;
  /** Makes from the zone. */
  fgm: number;
  /** Field-goal percentage, or null with no attempts. */
  fgPct: number | null;
}

/**
 * Tally attempts by zone. Every attempt lands in exactly one zone, so the totals
 * add up to the input and every zone is present in the output, including the
 * ones with no attempts.
 */
export function tallyByZone(attempts: readonly Attempt[]): ZoneTally[] {
  const tallies = new Map<ShotZoneId, { fga: number; fgm: number }>();
  for (const attempt of attempts) {
    const id = zoneFor(attempt.x, attempt.y);
    const tally = tallies.get(id) ?? { fga: 0, fgm: 0 };
    tally.fga += 1;
    if (attempt.made) tally.fgm += 1;
    tallies.set(id, tally);
  }

  return SHOT_ZONE_DEFINITIONS.map((zone) => {
    const { fga, fgm } = tallies.get(zone.id) ?? { fga: 0, fgm: 0 };
    return {
      id: zone.id,
      label: zone.label,
      group: zone.group,
      fga,
      fgm,
      fgPct: fga > 0 ? (fgm / fga) * 100 : null,
    };
  });
}
