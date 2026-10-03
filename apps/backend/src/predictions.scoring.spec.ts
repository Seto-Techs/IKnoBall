import { describe, expect, it } from 'vitest';
import {
  deVig,
  fairDecimal,
  pointsFor,
  potentialPoints,
  POINTS_CEILING,
  POINTS_SCALE,
} from '@iknoball/predictions';

describe('deVig', () => {
  it('normalises implied probabilities to sum to 1', () => {
    const fair = deVig(1.91, 1.79);
    expect(1 / fair.home + 1 / fair.away).toBeCloseTo(1, 12);
  });

  it('reports the overround as the implied-probability sum', () => {
    expect(deVig(1.91, 1.79).overround).toBeCloseTo(1 / 1.91 + 1 / 1.79, 12);
  });

  it('raises both sides above the raw price, since raw carries the margin', () => {
    const fair = deVig(1.91, 1.79);
    expect(fair.home).toBeGreaterThan(1.91);
    expect(fair.away).toBeGreaterThan(1.79);
  });

  it('gives both sides identical expected value, so no strategy has an edge', () => {
    // A perfectly calibrated picker must score the same either way.
    const fair = deVig(1.91, 1.79);
    expect((1 / fair.home) * fair.home).toBeCloseTo((1 / fair.away) * fair.away, 12);
    expect((1 / fair.home) * fair.home).toBeCloseTo(1, 12);
  });

  it('leaves an even market even', () => {
    const fair = deVig(2, 2);
    expect(fair.home).toBeCloseTo(2, 12);
    expect(fair.away).toBeCloseTo(2, 12);
    expect(fair.overround).toBeCloseTo(1, 12);
  });

  it('handles a heavy favourite without inverting the sides', () => {
    // -450 / +360, a real NBA line.
    const fair = deVig(1.222, 4.6);
    expect(fair.home).toBeLessThan(fair.away);
    expect(fair.home).toBeCloseTo(1.266, 3);
    expect(fair.away).toBeCloseTo(4.764, 3);
  });
});

describe('fairDecimal', () => {
  it('returns the side that was asked for', () => {
    const fair = deVig(1.91, 1.79);
    expect(fairDecimal(1.91, 1.79, 'home')).toBeCloseTo(fair.home, 12);
    expect(fairDecimal(1.91, 1.79, 'away')).toBeCloseTo(fair.away, 12);
  });
});

describe('pointsFor', () => {
  it('pays 1 for a correct flat pick and 0 for a wrong one', () => {
    expect(pointsFor('flat', null, true)).toBe(1);
    expect(pointsFor('flat', null, false)).toBe(0);
  });

  it('ignores the locked price in flat mode', () => {
    expect(pointsFor('flat', 4.6, true)).toBe(1);
  });

  it('pays nothing for a wrong weighted pick, however long the price', () => {
    expect(pointsFor('weighted', 4.6, false)).toBe(0);
    expect(pointsFor('weighted', 12, false)).toBe(0);
  });

  it('scales a weighted win by the locked decimal', () => {
    expect(pointsFor('weighted', 2.067, true)).toBe(Math.round(POINTS_SCALE * 2.067));
    expect(pointsFor('weighted', 1.266, true)).toBe(13);
  });

  it('rewards the underdog more than the favourite', () => {
    const favourite = pointsFor('weighted', 1.266, true);
    const underdog = pointsFor('weighted', 4.764, true);
    expect(underdog).toBeGreaterThan(favourite * 3);
  });

  it('caps a corrupt long price instead of minting points', () => {
    expect(pointsFor('weighted', 3000, true)).toBe(POINTS_CEILING);
  });

  it('does not clip a real result: the biggest underdog to win was +1100', () => {
    expect(pointsFor('weighted', 12, true)).toBe(120);
    expect(pointsFor('weighted', 12, true)).toBeLessThan(POINTS_CEILING);
  });

  it('returns 0 for a weighted win with no locked price', () => {
    expect(pointsFor('weighted', null, true)).toBe(0);
  });
});

describe('potentialPoints', () => {
  it('is what the pick pays if it comes in', () => {
    expect(potentialPoints('weighted', 2.067)).toBe(pointsFor('weighted', 2.067, true));
    expect(potentialPoints('flat', null)).toBe(1);
  });
});
