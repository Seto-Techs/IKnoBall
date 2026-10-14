import {
  COURT,
  CORNER_JOIN_Y,
  SHOT_ZONE_DEFINITIONS,
  type ShotZoneDefinition,
  type ShotZoneId,
} from '@iknoball/shot-zones';

/**
 * The drawing half of the shot-zone taxonomy.
 *
 * What a zone *means* and which zone an attempt belongs to live in
 * `@iknoball/shot-zones`, because the worker has to classify shots with the same
 * rules the chart draws. This module only adds the geometry: the outlines the
 * fills are painted with, and where each zone's numbers sit. Nothing here
 * decides a zone's boundaries, so the picture cannot disagree with the tallies.
 *
 * Coordinates are the shared frame — tenths of a foot, rim centre at the origin,
 * +x to the shooter's right, +y towards half court.
 */

// Re-exported so callers can get the whole taxonomy from one place.
export {
  COURT,
  CORNER_JOIN_Y,
  LEAGUE_ZONE_FG_PCT,
  SHOT_ZONE_DEFINITIONS,
  SHOT_ZONE_IDS,
  tallyByZone,
  zoneFor,
  type Attempt,
  type ShotZoneDefinition,
  type ShotZoneGroup,
  type ShotZoneId,
  type ZoneTally,
} from '@iknoball/shot-zones';

/** A tally row, named for the chart's point of view. */
export type { ZoneTally as ZoneStat } from '@iknoball/shot-zones';

/** A point in court coordinates. */
export type Point = readonly [number, number];

/** How a zone's numbers are drawn. */
interface ZoneGeometry {
  /** The zone's region, as one or more closed rings, for the chart's fills. */
  outline: readonly (readonly Point[])[];
  /**
   * Where the chart drops the zone's numbers. More than one point for a zone
   * that spans both sides of the floor, so neither side reads as unlabelled.
   */
  labelAt: readonly Point[];
  /**
   * Degrees to rotate the label. The corner strips are only 3 ft wide, so their
   * numbers run along the strip instead of across it.
   */
  labelRotation?: number;
  /**
   * How the two numbers are set. `stacked` puts the percentage under the
   * made/attempted; `inline` runs them along one line, which is what fits in a
   * rotated corner strip or the restricted area.
   */
  labelLayout?: 'stacked' | 'inline';
  /** Multiplier on the label's type size, for zones too small for the default. */
  labelScale?: number;
}

/** A zone's definition from the shared taxonomy, plus how to draw it. */
export interface ShotZone extends ShotZoneDefinition, ZoneGeometry {}

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Where the arc crosses the free-throw line, so the baseline mid stops here. */
const ARC_AT_FREE_THROW_Y = Math.sqrt(COURT.threeRadius ** 2 - COURT.freeThrowLineY ** 2);

/** The arc's angle at the corner join, and at the free-throw line. */
const CORNER_JOIN_ANGLE = degrees(Math.atan2(COURT.cornerThreeX, CORNER_JOIN_Y));
const FREE_THROW_ANGLE = degrees(Math.atan2(ARC_AT_FREE_THROW_Y, COURT.freeThrowLineY));

/** Where the deep-three circle leaves through the sideline, which caps the wing. */
const DEEP_AT_SIDELINE_Y = Math.sqrt(COURT.deepThreeRadius ** 2 - COURT.halfWidth ** 2);
const DEEP_AT_SIDELINE_ANGLE = degrees(Math.atan2(COURT.halfWidth, DEEP_AT_SIDELINE_Y));

/** Points along an arc of `radius`, between two angles from the rim. */
function arc(radius: number, fromAngle: number, toAngle: number, step = 3): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(toAngle - fromAngle) / step));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = ((fromAngle + ((toAngle - fromAngle) * i) / steps) * Math.PI) / 180;
    points.push([radius * Math.sin(angle), radius * Math.cos(angle)]);
  }
  return points;
}

/** An annular sector between two angles from the rim, as one closed ring. */
function arcBand(
  innerRadius: number,
  outerRadius: number,
  fromAngle: number,
  toAngle: number,
): Point[] {
  return [...arc(innerRadius, fromAngle, toAngle), ...arc(outerRadius, toAngle, fromAngle)];
}

/** Mirrors a ring across the centre line. */
function mirror(ring: readonly Point[]): Point[] {
  return ring.map(([x, y]) => [-x, y] as Point);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const PAINT_RING: Point[] = [
  [-COURT.paintHalfWidth, -COURT.rimToBaseline],
  [COURT.paintHalfWidth, -COURT.rimToBaseline],
  [COURT.paintHalfWidth, COURT.freeThrowLineY],
  [-COURT.paintHalfWidth, COURT.freeThrowLineY],
];

/**
 * The lane, with the restricted area cut out of it. The two rings are filled
 * with the even-odd rule, so the paint's own fill cannot cover the restricted
 * area's — without the hole, whichever zone is painted later wins and the rim
 * zone would never show its colour.
 */
const PAINT_OUTLINE: readonly Point[][] = [PAINT_RING, arc(COURT.restrictedRadius, -180, 180, 6)];

/** The right half of the baseline mid-range: lane edge, baseline, corner, arc. */
const BASELINE_MID_RIGHT: Point[] = [
  [COURT.paintHalfWidth, -COURT.rimToBaseline],
  [COURT.cornerThreeX, -COURT.rimToBaseline],
  [COURT.cornerThreeX, CORNER_JOIN_Y],
  ...arc(COURT.threeRadius, CORNER_JOIN_ANGLE, FREE_THROW_ANGLE),
  [COURT.paintHalfWidth, COURT.freeThrowLineY],
];

/**
 * The right half of the mid-range above the free-throw line. It runs all the way
 * to the centre line, because the taxonomy has no separate top-of-the-key two:
 * folding that strip in keeps the partition gap-free instead of leaving a wedge
 * of floor belonging to no zone.
 */
const ELBOW_MID_RIGHT: Point[] = [
  [ARC_AT_FREE_THROW_Y, COURT.freeThrowLineY],
  ...arc(COURT.threeRadius, FREE_THROW_ANGLE, 0),
  [0, COURT.freeThrowLineY],
];

/** The right corner three: the straight corner strip, out to the sideline. */
const CORNER_THREE_RIGHT: Point[] = [
  [COURT.cornerThreeX, -COURT.rimToBaseline],
  [COURT.halfWidth, -COURT.rimToBaseline],
  [COURT.halfWidth, CORNER_JOIN_Y],
  [COURT.cornerThreeX, CORNER_JOIN_Y],
];

/**
 * The right wing: everything past the arc from the top of the key out to the
 * corner, capped by the deep-three circle and the sideline. The corner strip
 * stays clear because the ring's inner edge stops at the corner join.
 */
const WING_THREE_RIGHT: Point[] = [
  ...arc(COURT.threeRadius, COURT.topOfKeyAngle, CORNER_JOIN_ANGLE),
  [COURT.halfWidth, CORNER_JOIN_Y],
  [COURT.halfWidth, DEEP_AT_SIDELINE_Y],
  ...arc(COURT.deepThreeRadius, DEEP_AT_SIDELINE_ANGLE, COURT.topOfKeyAngle),
];

/** Everything past the deep-three circle, out to half court. */
const DEEP_THREE_RING: Point[] = [
  [COURT.halfWidth, DEEP_AT_SIDELINE_Y],
  [COURT.halfWidth, COURT.halfCourtY],
  [-COURT.halfWidth, COURT.halfCourtY],
  [-COURT.halfWidth, DEEP_AT_SIDELINE_Y],
  ...arc(COURT.deepThreeRadius, -DEEP_AT_SIDELINE_ANGLE, DEEP_AT_SIDELINE_ANGLE),
];

/**
 * How to draw each zone. The restricted area's label sits above the backboard
 * and inside the 4 ft circle on one line, because the circle is only 8 ft across
 * and the backboard and rim occupy its lower half; the paint's sits below the
 * free-throw circle so its arc does not run through the numbers; and the wing
 * labels are pushed out past the three-point arc, which otherwise cuts through
 * the inner corner of the text.
 */
const ZONE_GEOMETRY: Readonly<Record<ShotZoneId, ZoneGeometry>> = {
  restrictedArea: {
    outline: [arc(COURT.restrictedRadius, -180, 180, 6)],
    labelAt: [[0, 24]],
    labelScale: 0.72,
    labelLayout: 'inline',
  },
  paint: {
    outline: PAINT_OUTLINE,
    labelAt: [[0, 100]],
  },
  baselineMidLeft: {
    outline: [mirror(BASELINE_MID_RIGHT)],
    labelAt: [[-140, 50]],
  },
  baselineMidRight: {
    outline: [BASELINE_MID_RIGHT],
    labelAt: [[140, 50]],
  },
  elbowMidLeft: {
    outline: [mirror(ELBOW_MID_RIGHT)],
    labelAt: [[-88, 175]],
  },
  elbowMidRight: {
    outline: [ELBOW_MID_RIGHT],
    labelAt: [[88, 175]],
  },
  cornerThreeLeft: {
    outline: [mirror(CORNER_THREE_RIGHT)],
    labelAt: [[-235, 20]],
    labelRotation: -90,
    labelLayout: 'inline',
  },
  cornerThreeRight: {
    outline: [CORNER_THREE_RIGHT],
    labelAt: [[235, 20]],
    labelRotation: 90,
    labelLayout: 'inline',
  },
  wingThreeLeft: {
    outline: [mirror(WING_THREE_RIGHT)],
    labelAt: [[-184, 192]],
    labelScale: 0.92,
  },
  wingThreeRight: {
    outline: [WING_THREE_RIGHT],
    labelAt: [[184, 192]],
    labelScale: 0.92,
  },
  topOfKeyThree: {
    outline: [
      arcBand(COURT.threeRadius, COURT.deepThreeRadius, -COURT.topOfKeyAngle, COURT.topOfKeyAngle),
    ],
    labelAt: [[0, 268]],
  },
  deepThree: {
    outline: [DEEP_THREE_RING],
    labelAt: [[0, 335]],
  },
};

/**
 * The zones, in the order the taxonomy lists them, each paired with its
 * geometry. Built by merging rather than hand-written so a zone added to the
 * taxonomy fails loudly here until it is given an outline, instead of silently
 * going missing from the chart.
 */
export const ZONES: readonly ShotZone[] = SHOT_ZONE_DEFINITIONS.map((definition) => ({
  ...definition,
  ...ZONE_GEOMETRY[definition.id],
}));

/** Each zone's boundary in plain words, keyed by id. */
export const ZONE_RULES: Readonly<Record<ShotZoneId, string>> = Object.fromEntries(
  SHOT_ZONE_DEFINITIONS.map((zone) => [zone.id, zone.rule]),
) as Readonly<Record<ShotZoneId, string>>;

/** The SVG path for a zone's fills, in court coordinates with y still pointing up. */
export function zonePath(zone: ShotZone): string {
  return zone.outline
    .map((ring) => `M ${ring.map(([x, y]) => `${round(x)} ${round(-y)}`).join(' L ')} Z`)
    .join(' ');
}

/** The court's painted markings, as SVG paths in court coordinates. */
export const COURT_MARKINGS: readonly string[] = [
  // Baseline, sidelines and half court.
  `M ${-COURT.halfWidth} ${round(COURT.rimToBaseline)} L ${COURT.halfWidth} ${round(
    COURT.rimToBaseline,
  )}`,
  `M ${-COURT.halfWidth} ${-round(COURT.rimToBaseline)} L ${-COURT.halfWidth} ${-round(
    COURT.halfCourtY,
  )}`,
  `M ${COURT.halfWidth} ${-round(COURT.rimToBaseline)} L ${COURT.halfWidth} ${-round(
    COURT.halfCourtY,
  )}`,
  `M ${-COURT.halfWidth} ${-round(COURT.halfCourtY)} L ${COURT.halfWidth} ${-round(
    COURT.halfCourtY,
  )}`,
  // The lane.
  `M ${-COURT.paintHalfWidth} ${round(COURT.rimToBaseline)} L ${COURT.paintHalfWidth} ${round(
    COURT.rimToBaseline,
  )} L ${COURT.paintHalfWidth} ${round(-COURT.freeThrowLineY)} L ${-COURT.paintHalfWidth} ${round(
    -COURT.freeThrowLineY,
  )} Z`,
  // The free-throw circle, both halves.
  `M -60 ${round(-COURT.freeThrowLineY)} A 60 60 0 0 0 60 ${round(
    -COURT.freeThrowLineY,
  )} A 60 60 0 0 0 -60 ${round(-COURT.freeThrowLineY)}`,
  // The restricted arc.
  `M ${-COURT.restrictedRadius} 0 A ${COURT.restrictedRadius} ${COURT.restrictedRadius} 0 0 1 ${
    COURT.restrictedRadius
  } 0`,
  // The three-point line: corner, arc, corner.
  `M ${-COURT.cornerThreeX} ${round(COURT.rimToBaseline)} L ${-COURT.cornerThreeX} ${round(
    -CORNER_JOIN_Y,
  )} A ${COURT.threeRadius} ${COURT.threeRadius} 0 0 1 ${COURT.cornerThreeX} ${round(
    -CORNER_JOIN_Y,
  )} L ${COURT.cornerThreeX} ${round(COURT.rimToBaseline)}`,
  // Backboard and rim.
  `M -30 ${round(COURT.rimToBaseline - 40)} L 30 ${round(COURT.rimToBaseline - 40)}`,
  `M -7.5 0 A 7.5 7.5 0 0 0 7.5 0 A 7.5 7.5 0 0 0 -7.5 0`,
];
