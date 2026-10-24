import { describe, expect, it } from 'vitest';
import { hasPlayed, shouldRefreshSeasonStats } from './boxscore-crawler.service';

describe('hasPlayed', () => {
  it('counts a player who logged time', () => {
    expect(hasPlayed('PT36M28.00S')).toBe(true);
    expect(hasPlayed('35:12')).toBe(true);
  });

  it('counts a player who only got seconds', () => {
    // A 12-second run still moves the player's season totals.
    expect(hasPlayed('PT00M12.00S')).toBe(true);
  });

  it('skips a DNP in either feed spelling', () => {
    expect(hasPlayed('PT00M00.00S')).toBe(false);
    expect(hasPlayed('0:00')).toBe(false);
    expect(hasPlayed('0')).toBe(false);
    expect(hasPlayed('')).toBe(false);
    expect(hasPlayed(null)).toBe(false);
  });
});

describe('shouldRefreshSeasonStats', () => {
  const now = new Date('2026-10-22T03:00:00Z');

  it('queues a game that has just finished', () => {
    expect(shouldRefreshSeasonStats(3, new Date('2026-10-22T00:30:00Z'), now)).toBe(true);
  });

  it('ignores a game that is live or still scheduled', () => {
    expect(shouldRefreshSeasonStats(2, new Date('2026-10-22T00:30:00Z'), now)).toBe(false);
    expect(shouldRefreshSeasonStats(1, new Date('2026-10-23T00:30:00Z'), now)).toBe(false);
  });

  it('ignores an old final so a season crawl does not re-queue it', () => {
    expect(shouldRefreshSeasonStats(3, new Date('2026-10-19T00:30:00Z'), now)).toBe(false);
  });

  it('ignores a tip-off it cannot read', () => {
    expect(shouldRefreshSeasonStats(3, null, now)).toBe(false);
    expect(shouldRefreshSeasonStats(3, new Date('not a date'), now)).toBe(false);
  });
});
