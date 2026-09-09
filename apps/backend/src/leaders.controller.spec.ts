import { compareLeaderRows, computeMinGp } from './leaders.controller';

describe('computeMinGp (NBA.com 58-GP rule, pro-rated to season progress)', () => {
  it('is effectively no filter at season start (no empty board)', () => {
    expect(computeMinGp(0)).toBe(1);
    expect(computeMinGp(1)).toBe(1);
    expect(computeMinGp(2)).toBe(2);
    expect(computeMinGp(3)).toBe(3);
    expect(computeMinGp(5)).toBe(4);
  });

  it('never exceeds the games played so far, so the leading player always qualifies', () => {
    for (let gamesSoFar = 0; gamesSoFar <= 82; gamesSoFar++) {
      expect(computeMinGp(gamesSoFar)).toBeLessThanOrEqual(Math.max(1, gamesSoFar));
    }
  });

  it('requires 58 GP at the end of a full 82-GP season', () => {
    expect(computeMinGp(82)).toBe(58);
  });

  it('scales with season length (2011-12 lockout precedent: 66 games -> ~47)', () => {
    expect(computeMinGp(66)).toBe(47);
  });

  it('reaches the 58-GP cutoff at season end (gamesSoFar = 82)', () => {
    expect(computeMinGp(82)).toBe(58);
    expect(computeMinGp(76)).toBe(54);
    expect(computeMinGp(58)).toBe(42);
  });
});

describe('compareLeaderRows', () => {
  it('orders by value descending', () => {
    expect(compareLeaderRows('ast', { gp: 70, ast: 8.0 }, { gp: 60, ast: 9.9 })).toBeGreaterThan(0);
    expect(compareLeaderRows('ast', { gp: 60, ast: 9.9 }, { gp: 70, ast: 8.0 })).toBeLessThan(0);
  });

  it('breaks value ties by fewer games played (NBA.com rule)', () => {
    // REB 11.5: Wemby (64 gp) above Gobert (76 gp)
    expect(compareLeaderRows('reb', { gp: 64, reb: 11.5 }, { gp: 76, reb: 11.5 })).toBeLessThan(0);
    // BLK 1.9: Chet (69) above Huff (82)
    expect(compareLeaderRows('blk', { gp: 69, blk: 1.9 }, { gp: 82, blk: 1.9 })).toBeLessThan(0);
    // STL 1.9: Kawhi (65) > Maxey (70) > Wallace (77)
    const rows = [
      { gp: 77, stl: 1.9 },
      { gp: 65, stl: 1.9 },
      { gp: 70, stl: 1.9 },
    ];
    const sorted = [...rows].sort((a, b) => compareLeaderRows('stl', a, b));
    expect(sorted.map((r) => r.gp)).toEqual([65, 70, 77]);
  });

  it('treats null values as zero', () => {
    expect(compareLeaderRows('pts', { gp: 10, pts: null }, { gp: 10, pts: 0 })).toBe(0);
  });
});
