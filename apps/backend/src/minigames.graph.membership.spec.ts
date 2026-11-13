import { describe, expect, it } from 'vitest';
import { buildGraph, receiptsBetween } from './minigames.graph';

describe('LeBronnect historical memberships', () => {
  it('links Adams and Bane through Memphis 2022-23', () => {
    const graph = buildGraph([
      {
        playerId: 'adams',
        externalId: '203500',
        name: 'Steven Adams',
        team: 'MEM',
        season: '2022-23',
        games: 42,
      },
      {
        playerId: 'bane',
        externalId: '1630217',
        name: 'Desmond Bane',
        team: 'MEM',
        season: '2022-23',
        games: 58,
      },
    ]);

    expect(receiptsBetween(graph, 'adams', 'bane')).toEqual([
      { team: 'MEM', seasons: ['2022-23'] },
    ]);
  });
});
