import { describe, expect, it } from 'vitest';
import {
  DAY_OVER_GRACE_MS,
  RECAP_SETTLE_MS,
  formatDayLabel,
  isDayOver,
  latestFinishedDay,
  recapDueAt,
  recapIntro,
  recapModes,
  shouldPostRecap,
  type DayState,
} from './board';

/**
 * Which league day the daily board is for.
 *
 * Pure on purpose — no clock, no database — so the one decision that can leave a
 * guild with yesterday's board (or no board at all) is pinned to exact dates here
 * rather than discovered in a channel a day later.
 */

/** 27 October 2026, 15:30 ET: the night's first tip-off. */
const TIP_OFF = new Date('2026-10-27T23:30:00.000Z');

function day(overrides: Partial<DayState> = {}): DayState {
  return {
    slateKey: '2026-10-27',
    games: 2,
    finals: 2,
    lastTipOff: TIP_OFF,
    lastFinalAt: new Date('2026-10-28T03:00:00.000Z'),
    ...overrides,
  };
}

describe('isDayOver', () => {
  it('is over once every game is final', () => {
    expect(isDayOver(day(), TIP_OFF)).toBe(true);
  });

  it('is not over while a game is still live', () => {
    expect(isDayOver(day({ finals: 1 }), TIP_OFF)).toBe(false);
  });

  it('is over once the last tip-off is four hours behind, finals or not', () => {
    // The feed can go quiet or a postponed game can keep its tip-off; the board must
    // still appear in the morning rather than wait for a status that never lands.
    const stuck = day({ finals: 0 });

    expect(isDayOver(stuck, new Date(TIP_OFF.getTime() + DAY_OVER_GRACE_MS - 1))).toBe(false);
    expect(isDayOver(stuck, new Date(TIP_OFF.getTime() + DAY_OVER_GRACE_MS))).toBe(true);
  });

  it('treats a day with no games, or no tip-off, as over', () => {
    expect(isDayOver(day({ games: 0, finals: 0 }), TIP_OFF)).toBe(true);
    expect(isDayOver(day({ finals: 0, lastTipOff: null }), TIP_OFF)).toBe(true);
  });
});

describe('latestFinishedDay', () => {
  it('is the most recent day whose games are all done', () => {
    const days = [
      day({ slateKey: '2026-10-25' }),
      day({ slateKey: '2026-10-26' }),
      // Tonight: still live, so the board is not for it yet.
      day({ slateKey: '2026-10-27', finals: 1 }),
    ];

    expect(latestFinishedDay(days, TIP_OFF)?.slateKey).toBe('2026-10-26');
  });

  it('skips a game-less day, so an off night does not hold the board hostage', () => {
    // 27 October was off; without the skip it is trivially "over" and forever the
    // latest, and the 26th's board would never post.
    const days = [
      day({ slateKey: '2026-10-26' }),
      day({ slateKey: '2026-10-27', games: 0, finals: 0 }),
    ];

    expect(latestFinishedDay(days, new Date('2026-10-28T13:00:00.000Z'))?.slateKey).toBe(
      '2026-10-26',
    );
  });

  it('is null when nothing has finished yet', () => {
    expect(latestFinishedDay([day({ finals: 0 })], TIP_OFF)).toBeNull();
    expect(latestFinishedDay([], TIP_OFF)).toBeNull();
  });

  it('answers the same day on a later tick, which is how a missed morning catches up', () => {
    const days = [day({ slateKey: '2026-10-26' }), day({ slateKey: '2026-10-27', finals: 1 })];

    // Morning of the 27th: only the 26th is finished.
    expect(latestFinishedDay(days, new Date('2026-10-27T13:00:00.000Z'))?.slateKey).toBe(
      '2026-10-26',
    );
    // Morning of the 28th, having missed the 27th entirely: the 27th is finished now.
    expect(latestFinishedDay(days, new Date('2026-10-28T13:00:00.000Z'))?.slateKey).toBe(
      '2026-10-27',
    );
  });
});

describe('when the board is due', () => {
  it('is noon ET the day after the slate, even though the games ended hours earlier', () => {
    // The 27th's last buzzer was 03:00 UTC on the 28th; noon in New York (EDT) is
    // 16:00 UTC.
    expect(recapDueAt(day()).toISOString()).toBe('2026-10-28T16:00:00.000Z');
  });

  it('is noon in January too, which is 17:00 UTC once the clocks are back', () => {
    const winter = day({
      slateKey: '2027-01-05',
      lastTipOff: new Date('2027-01-06T00:30:00.000Z'),
      lastFinalAt: new Date('2027-01-06T03:00:00.000Z'),
    });

    expect(recapDueAt(winter).toISOString()).toBe('2027-01-06T17:00:00.000Z');
  });

  it('waits fifteen minutes after a buzzer that lands past noon', () => {
    const late = day({ lastFinalAt: new Date('2026-10-28T17:00:00.000Z') });

    expect(recapDueAt(late).toISOString()).toBe('2026-10-28T17:15:00.000Z');
  });

  it('still leaves the settlement window when the buzzer is just before noon', () => {
    // A final at 15:45 UTC would be due at 16:00 — the same instant as noon, so noon
    // wins and nothing is lost. One minute later and the settle window is the floor.
    const justBefore = day({ lastFinalAt: new Date('2026-10-28T15:45:00.000Z') });
    const justAfter = day({ lastFinalAt: new Date('2026-10-28T15:46:00.000Z') });

    expect(recapDueAt(justBefore).toISOString()).toBe('2026-10-28T16:00:00.000Z');
    expect(recapDueAt(justAfter).toISOString()).toBe('2026-10-28T16:01:00.000Z');
  });

  it('falls back to the tip-off grace when the feed never said when the game ended', () => {
    // No box score summary: the day counts as over four hours after the last tip-off,
    // and the board waits `RECAP_SETTLE_MS` after that.
    const quiet = day({
      lastFinalAt: null,
      lastTipOff: new Date('2026-10-28T14:00:00.000Z'),
    });

    const expected = new Date(
      new Date('2026-10-28T14:00:00.000Z').getTime() + DAY_OVER_GRACE_MS + RECAP_SETTLE_MS,
    );
    expect(recapDueAt(quiet).toISOString()).toBe(expected.toISOString());
    expect(recapDueAt(quiet).getTime()).toBeGreaterThan(
      new Date('2026-10-28T16:00:00.000Z').getTime(),
    );
  });

  it('is noon alone when the day has neither a buzzer nor a tip-off', () => {
    const bare = day({ lastFinalAt: null, lastTipOff: null });

    expect(recapDueAt(bare).toISOString()).toBe('2026-10-28T16:00:00.000Z');
  });
});

describe('which modes the board shows', () => {
  it('shows both boards when nobody asked for one', () => {
    expect(recapModes(null)).toEqual(['flat', 'weighted']);
  });

  it('shows the one a caller asked for', () => {
    expect(recapModes('weighted')).toEqual(['weighted']);
  });
});

describe('whether a board is worth posting', () => {
  it('declines a day nobody picked', () => {
    expect(shouldPostRecap(0)).toBe(false);
  });

  it('posts for a single settled pick', () => {
    expect(shouldPostRecap(1)).toBe(true);
  });
});

describe('the day label on the recap card', () => {
  it('reads as a day, not as a key', () => {
    expect(formatDayLabel('2026-11-12')).toBe('Thu 12 Nov');
  });

  it('does not shift across a month boundary', () => {
    expect(formatDayLabel('2026-12-01')).toBe('Tue 1 Dec');
  });

  it('hands back anything that is not a day key unchanged', () => {
    // The card is drawn from a database value; a surprise should read oddly, not throw
    // and cost the guild its leaderboard.
    expect(formatDayLabel('not-a-day')).toBe('not-a-day');
  });
});

describe('the intro line', () => {
  it('names the day and the number of settled picks', () => {
    expect(recapIntro('2026-10-27', 12)).toBe(
      '**2026-10-27 is final** — 12 picks settled. How the server finished:',
    );
  });

  it('says one pick, not 1 picks', () => {
    expect(recapIntro('2026-10-27', 1)).toContain('1 pick settled');
  });
});
