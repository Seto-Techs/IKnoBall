import { describe, expect, it } from 'vitest';
import {
  dateKeyIn,
  etDateKey,
  formatDayKey,
  isDateKey,
  localClock,
  localHour,
  shiftDateKey,
  shiftEtDate,
  slateDateKey,
} from './slate-date';

/**
 * The two clocks, pinned to real instants.
 *
 * The date keys here are the web slate's: `apps/frontend/src/lib/game-utils.ts`
 * derives them the same way, so a game that belongs to 27 October on the site
 * belongs to 27 October here.
 */

describe('the ET slate day', () => {
  it('puts a late tip-off on the day it is listed under, not the UTC day', () => {
    // 10:00 PM EDT on 27 October is 02:00 UTC on the 28th.
    expect(etDateKey(new Date('2026-10-28T02:00:00.000Z'))).toBe('2026-10-27');
  });

  it('rolls over at ET midnight, which is 04:00 UTC in summer', () => {
    expect(etDateKey(new Date('2026-10-28T03:59:59.000Z'))).toBe('2026-10-27');
    expect(etDateKey(new Date('2026-10-28T04:00:00.000Z'))).toBe('2026-10-28');
  });

  it('follows the DST shift rather than a fixed offset', () => {
    // After 1 November, ET midnight is 05:00 UTC.
    expect(etDateKey(new Date('2026-11-02T04:30:00.000Z'))).toBe('2026-11-01');
    expect(etDateKey(new Date('2026-11-02T05:00:00.000Z'))).toBe('2026-11-02');
  });

  it('is the same key in any other zone it is asked about', () => {
    const instant = new Date('2026-10-28T02:00:00.000Z');
    expect(dateKeyIn(instant, 'America/New_York')).toBe('2026-10-27');
    expect(dateKeyIn(instant, 'Europe/London')).toBe('2026-10-28');
    expect(dateKeyIn(instant, 'Australia/Sydney')).toBe('2026-10-28');
  });
});

describe('a game’s slate day', () => {
  it('trusts the schedule’s own ET date first', () => {
    expect(slateDateKey({ gameDate: '2026-10-27', gameDateTime: '2026-10-28T02:00:00.000Z' })).toBe(
      '2026-10-27',
    );
  });

  it('falls back to the tip-off in ET when the schedule has no date', () => {
    expect(slateDateKey({ gameDate: null, gameDateTime: '2026-10-28T02:00:00.000Z' })).toBe(
      '2026-10-27',
    );
  });

  it('has no day when it has neither', () => {
    expect(slateDateKey({})).toBeNull();
    expect(slateDateKey({ gameDate: null, gameDateTime: null })).toBeNull();
    expect(slateDateKey({ gameDateTime: 'not a date' })).toBeNull();
  });

  it('accepts a Date-shaped gameDate string, which is what the driver returns', () => {
    // `gameDate` is a `date` column read in string mode, but a driver that hands
    // back a timestamp must still key on the date part.
    expect(slateDateKey({ gameDate: '2026-10-27T00:00:00.000Z' })).toBe('2026-10-27');
  });
});

describe('the guild’s wall clock', () => {
  const instant = new Date('2026-10-27T13:00:00.000Z');

  it('is 9 a.m. in New York', () => {
    expect(localHour(instant, 'America/New_York')).toBe(9);
    expect(localClock(instant, 'America/New_York')).toBe('09:00');
  });

  it('is 1 p.m. in London', () => {
    expect(localHour(instant, 'Europe/London')).toBe(13);
  });

  it('is already the next morning in Sydney', () => {
    // 13:00 UTC on the 27th is 00:00 on the 28th in AEDT… which is the point:
    // the hour, not the date, decides whether a guild posts.
    expect(localHour(instant, 'Australia/Sydney')).toBe(0);
    expect(localHour(new Date('2026-10-27T22:00:00.000Z'), 'Australia/Sydney')).toBe(9);
  });
});

describe('day arithmetic', () => {
  it('shifts a key by whole days', () => {
    expect(shiftDateKey('2026-10-27', 1)).toBe('2026-10-28');
    expect(shiftDateKey('2026-10-27', -1)).toBe('2026-10-26');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('does not lose a day across a DST boundary', () => {
    expect(shiftDateKey('2026-03-07', 1)).toBe('2026-03-08');
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDateKey('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('shifts from an instant', () => {
    expect(shiftEtDate(0, new Date('2026-10-28T02:00:00.000Z'))).toBe('2026-10-27');
    expect(shiftEtDate(1, new Date('2026-10-28T02:00:00.000Z'))).toBe('2026-10-28');
  });

  it('labels a key for a thread title', () => {
    expect(formatDayKey('2026-10-27')).toBe('Oct 27');
    expect(formatDayKey('2026-01-01')).toBe('Jan 1');
  });

  it('accepts only keys that are real calendar days', () => {
    expect(isDateKey('2026-10-31')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    // The shape is right and the day is not: a date that parses to something else
    // must not be treated as a day with no games.
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-10-31T00:00')).toBe(false);
    expect(isDateKey('31-10-2026')).toBe(false);
    expect(isDateKey('tomorrow')).toBe(false);
  });
});
