import { describe, expect, it } from 'vitest';
import { parsePickCustomId, pickCustomId } from './pick-id';

describe('pick custom_id', () => {
  it('round-trips what the card writes and the router dispatches on', () => {
    expect(pickCustomId('0022601194', 'away')).toBe('pick:0022601194:away');
    expect(parsePickCustomId('pick:0022601194:away')).toEqual({
      gameId: '0022601194',
      side: 'away',
    });
    expect(parsePickCustomId('pick:0022601194:home')).toEqual({
      gameId: '0022601194',
      side: 'home',
    });
  });

  it('fits the 100-character custom_id budget', () => {
    expect(pickCustomId('0022601194', 'home').length).toBeLessThanOrEqual(100);
  });

  it('refuses anything it did not write', () => {
    for (const bad of [
      '',
      'pick',
      'pick:0022601194',
      'pick:0022601194:draw',
      'pick::home',
      'pick:0022601194:home:extra',
      'picks:0022601194:home',
      'pick:0022601194:HOME',
      'link:0022601194:home',
    ]) {
      expect(parsePickCustomId(bad)).toBeNull();
    }
  });
});
