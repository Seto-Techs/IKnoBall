import type { DatabaseService } from '../infrastructure/database/database.service';
import { getPreviousSeason, resolveCurrentSeason, seasonForDate } from './season';

/** A db whose season-start lookup finds nothing, so the fallback map decides. */
const noScheduleDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
      }),
    }),
  }),
} as unknown as DatabaseService['db'];

describe('seasonForDate', () => {
  it('opens the season named after the year from July onward', () => {
    expect(seasonForDate(new Date('2026-07-01T00:00:00Z'))).toBe('2026-27');
    expect(seasonForDate(new Date('2026-10-23T00:00:00Z'))).toBe('2026-27');
  });

  it('keeps January to June in the season that began last October', () => {
    expect(seasonForDate(new Date('2026-01-15T00:00:00Z'))).toBe('2025-26');
    expect(seasonForDate(new Date('2026-06-30T00:00:00Z'))).toBe('2025-26');
  });
});

describe('getPreviousSeason', () => {
  it('steps back a year', () => {
    expect(getPreviousSeason('2026-27')).toBe('2025-26');
    expect(getPreviousSeason('2025-26')).toBe('2024-25');
  });

  it('passes a malformed label through', () => {
    expect(getPreviousSeason('current')).toBe('current');
  });
});

describe('resolveCurrentSeason', () => {
  const saved = {
    season: process.env.NBA_CURRENT_SEASON,
    start: process.env.NBA_SEASON_START_DATE,
  };

  beforeEach(() => {
    delete process.env.NBA_CURRENT_SEASON;
    delete process.env.NBA_SEASON_START_DATE;
  });

  afterEach(() => {
    if (saved.season === undefined) delete process.env.NBA_CURRENT_SEASON;
    else process.env.NBA_CURRENT_SEASON = saved.season;
    if (saved.start === undefined) delete process.env.NBA_SEASON_START_DATE;
    else process.env.NBA_SEASON_START_DATE = saved.start;
  });

  it('follows the calendar when the env var is unset (regression: was pinned to 2025-26)', async () => {
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-10-23T00:00:00Z'))).toBe(
      '2026-27',
    );
  });

  it('serves the previous season more than a week before opening night', async () => {
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-09-01T00:00:00Z'))).toBe(
      '2025-26',
    );
  });

  it('hands over inside the week before opening night', async () => {
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-10-18T00:00:00Z'))).toBe(
      '2026-27',
    );
  });

  it('serves the configured season even when the calendar would derive another', async () => {
    // The operator's explicit value wins: an override that cannot override is
    // dead config, and this is the only way to pin a season the calendar misses
    // (a delayed or shortened season).
    process.env.NBA_CURRENT_SEASON = '2027-28';
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-10-23T00:00:00Z'))).toBe(
      '2027-28',
    );
  });

  it('still reports a season that disagrees with the calendar, and serves it anyway', async () => {
    // A forgotten bump is how the API falls behind the worker, which syncs by
    // the calendar — worth one warning, but not worth overriding the operator.
    process.env.NBA_CURRENT_SEASON = '2025-26';
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-10-23T00:00:00Z'))).toBe(
      '2025-26',
    );
  });

  it('serves the configured season even before its opening night (grace is for the derived path only)', async () => {
    // Unset, the same date falls back to the previous season because nothing has
    // been played yet. Configured, the operator has already made that call.
    const beforeOpeningNight = new Date('2026-09-01T00:00:00Z');
    expect(await resolveCurrentSeason(noScheduleDb, beforeOpeningNight)).toBe('2025-26');
    process.env.NBA_CURRENT_SEASON = '2026-27';
    expect(await resolveCurrentSeason(noScheduleDb, beforeOpeningNight)).toBe('2026-27');
  });

  it('treats a blank NBA_CURRENT_SEASON as unset', async () => {
    process.env.NBA_CURRENT_SEASON = '   ';
    expect(await resolveCurrentSeason(noScheduleDb, new Date('2026-10-23T00:00:00Z'))).toBe(
      '2026-27',
    );
  });

  it('matches the calendar when the configured season is the calendar season', async () => {
    const now = new Date('2026-10-23T00:00:00Z');
    const without = await resolveCurrentSeason(noScheduleDb, now);
    process.env.NBA_CURRENT_SEASON = without;
    expect(await resolveCurrentSeason(noScheduleDb, now)).toBe(without);
  });
});
