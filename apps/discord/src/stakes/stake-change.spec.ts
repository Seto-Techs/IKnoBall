import { describe, expect, it } from 'vitest';
import { sameStake } from './stake-change';

/**
 * The stake sweep's whole decision: is this card's points line out of date?
 *
 * Both directions matter. A false positive is a PATCH every five minutes for every
 * card on the slate; a false negative is the missing "+N pts" line this exists to
 * fill in.
 */
describe('sameStake', () => {
  it('leaves a card alone while its game still has no price', () => {
    expect(sameStake(null, null)).toBe(true);
  });

  it('edits a card posted without a line once the price lands', () => {
    expect(sameStake(null, { away: 120, home: 95 })).toBe(false);
  });

  it('leaves a card alone when the re-captured line has not moved', () => {
    expect(sameStake({ away: 120, home: 95 }, { away: 120, home: 95 })).toBe(true);
  });

  it('edits a card when the line moves', () => {
    expect(sameStake({ away: 120, home: 95 }, { away: 118, home: 97 })).toBe(false);
    expect(sameStake({ away: 120, home: 95 }, { away: 118, home: 95 })).toBe(false);
    expect(sameStake({ away: 120, home: 95 }, { away: 120, home: 97 })).toBe(false);
  });

  it('edits a card when one side stops paying', () => {
    expect(sameStake({ away: 120, home: 95 }, { away: null, home: 95 })).toBe(false);
  });

  it('edits a card when the price is dropped from the feed', () => {
    expect(sameStake({ away: 120, home: 95 }, null)).toBe(false);
  });
});
