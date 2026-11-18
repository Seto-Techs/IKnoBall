import { describe, expect, it } from 'vitest';
import {
  DAY_OVER_GRACE_MS,
  isDayOver,
  latestFinishedDay,
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
  return { slateKey: '2026-10-27', games: 2, finals: 2, lastTipOff: TIP_OFF, ...overrides };
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

    // 9 a.m. on the 27th: only the 26th is finished.
    expect(latestFinishedDay(days, new Date('2026-10-27T13:00:00.000Z'))?.slateKey).toBe(
      '2026-10-26',
    );
    // 9 a.m. on the 28th, having missed the 27th entirely: the 27th is finished now.
    expect(latestFinishedDay(days, new Date('2026-10-28T13:00:00.000Z'))?.slateKey).toBe(
      '2026-10-27',
    );
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
