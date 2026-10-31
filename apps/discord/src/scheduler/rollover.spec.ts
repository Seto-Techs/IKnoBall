import { describe, expect, it } from 'vitest';
import { recapIntro, recapModes, rolloverDecision, shouldPostRecap } from './rollover';

/**
 * The whole claim of the rollover is that "the day is over, post the next one" is a
 * small set of cases. These tests are the cases.
 */

function state(overrides: Partial<Parameters<typeof rolloverDecision>[0]> = {}) {
  return {
    lastPostedKey: '2026-10-30',
    dayOver: true,
    nextKey: '2026-10-31',
    ...overrides,
  };
}

describe('rolloverDecision', () => {
  it('rolls to the next day once the league day is over', () => {
    expect(rolloverDecision(state())).toEqual({
      roll: true,
      reason: 'roll',
      targetKey: '2026-10-31',
    });
  });

  it('does not roll while a game on the last day is still live', () => {
    expect(rolloverDecision(state({ dayOver: false }))).toEqual({
      roll: false,
      reason: 'day-open',
      targetKey: null,
    });
  });

  it('does not roll when the schedule has no upcoming games', () => {
    expect(rolloverDecision(state({ nextKey: null }))).toEqual({
      roll: false,
      reason: 'no-next-day',
      targetKey: null,
    });
  });

  it('treats the next day already being the current day as a no-op', () => {
    expect(rolloverDecision(state({ nextKey: '2026-10-30' }))).toEqual({
      roll: false,
      reason: 'already-current',
      targetKey: null,
    });
  });

  it('refuses to roll backwards onto a day that is already history', () => {
    // A next-day query that returns an earlier day is a bug in the query, not a
    // reason to re-post a slate the guild already had.
    expect(rolloverDecision(state({ nextKey: '2026-10-29' }))).toEqual({
      roll: false,
      reason: 'already-current',
      targetKey: null,
    });
  });

  it('reports the reason a reader would guess, not the first check that passed', () => {
    // The day is over, so "day open" is false; the answer is the season being quiet.
    expect(rolloverDecision(state({ nextKey: null })).reason).toBe('no-next-day');
  });

  it('rolls across a month boundary, because slate keys sort as dates', () => {
    expect(
      rolloverDecision(state({ lastPostedKey: '2026-10-31', nextKey: '2026-11-01' })),
    ).toMatchObject({ roll: true, targetKey: '2026-11-01' });
  });

  it('rolls across a year boundary', () => {
    expect(
      rolloverDecision(state({ lastPostedKey: '2026-12-31', nextKey: '2027-01-01' })),
    ).toMatchObject({ roll: true, targetKey: '2027-01-01' });
  });
});

describe('recapModes', () => {
  it('shows both boards when no mode was asked for', () => {
    expect(recapModes(null)).toEqual(['flat', 'weighted']);
  });

  it('shows one board when a mode was asked for', () => {
    expect(recapModes('weighted')).toEqual(['weighted']);
  });
});

describe('shouldPostRecap', () => {
  it('posts when at least one pick settled', () => {
    expect(shouldPostRecap(1)).toBe(true);
  });

  it('does not post an empty board for a day nobody picked', () => {
    // An empty table in a channel reads as the bot being broken, not as a quiet day.
    expect(shouldPostRecap(0)).toBe(false);
  });
});

describe('recapIntro', () => {
  it('names the day and counts the picks', () => {
    expect(recapIntro('2026-10-30', 7)).toBe(
      '**2026-10-30 is final** — 7 picks settled. How the server finished:',
    );
  });

  it('says "pick" rather than "picks" for a single one', () => {
    expect(recapIntro('2026-10-30', 1)).toBe(
      '**2026-10-30 is final** — 1 pick settled. How the server finished:',
    );
  });
});
