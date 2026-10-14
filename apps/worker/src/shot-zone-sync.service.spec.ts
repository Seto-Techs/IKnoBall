import { describe, expect, it } from 'vitest';
import { statsTimeframeFor } from './shot-zone-sync.service';

/**
 * The season type comes from the game id prefix, which is the only place it is
 * recorded. Getting a prefix wrong does not fail loudly — it files a game's
 * shots under the wrong timeframe, where the endpoint will happily serve them as
 * a different season type — so the mapping is pinned here.
 */
describe('statsTimeframeFor', () => {
  it('maps each game id prefix to the timeframe the player tables use', () => {
    expect(statsTimeframeFor('0012600045')).toBe('ByYear-preseason');
    expect(statsTimeframeFor('0022500001')).toBe('ByYear-regular');
    expect(statsTimeframeFor('0042500001')).toBe('ByYear-playoffs');
  });

  it('files play-in games as playoffs', () => {
    // 005 is the play-in tournament, which counts towards a player's playoff
    // numbers rather than being a season type of its own.
    expect(statsTimeframeFor('0052500001')).toBe('ByYear-playoffs');
  });

  it('skips All-Star games rather than filing them anywhere', () => {
    // 003 and 006 are All-Star, which no player's season totals include. Null
    // means the game is marked done without storing anything for it.
    expect(statsTimeframeFor('0032500001')).toBeNull();
    expect(statsTimeframeFor('0062500001')).toBeNull();
  });

  it('skips an unrecognised prefix rather than defaulting to a season', () => {
    // Defaulting would be worse than skipping: it would invent regular-season
    // attempts for a game the feed has never described that way.
    expect(statsTimeframeFor('9992500001')).toBeNull();
  });
});
