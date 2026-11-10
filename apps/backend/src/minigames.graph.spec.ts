import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  distanceBetween,
  gradeOf,
  receiptsBetween,
  type MembershipRow,
} from './minigames.graph';

/**
 * A five-player fixture with one club-season everyone shares and a pair who
 * never meet, which is everything the game's rules turn on.
 *
 *   a — b — c   (all three at BRK in 2021-22)
 *   c — d       (LAL 2022-23)
 *   e           alone at PHI, unreachable
 */
function row(
  playerId: string,
  team: string,
  season: string,
  games = 10,
  name = playerId.toUpperCase(),
): MembershipRow {
  return { playerId, externalId: `ext-${playerId}`, name, team, season, games };
}

const ROWS: MembershipRow[] = [
  row('a', 'BRK', '2021-22', 30, 'Aaron One'),
  row('b', 'BRK', '2021-22', 30, 'Ben Two'),
  row('c', 'BRK', '2021-22', 30, 'Cal Three'),
  row('c', 'LAL', '2022-23', 20, 'Cal Three'),
  row('d', 'LAL', '2022-23', 25, 'Dee Four'),
  row('e', 'PHI', '2023-24', 5, 'Eve Five'),
];

describe('the teammate graph', () => {
  const graph = buildGraph(ROWS);

  it('links every pair who appeared for the same club in the same season', () => {
    expect([...(graph.neighbours.get('a') ?? [])].sort()).toEqual(['b', 'c']);
  });

  it('groups the shared seasons of a link into one receipt per club', () => {
    expect(receiptsBetween(graph, 'a', 'b')).toEqual([{ team: 'BRK', seasons: ['2021-22'] }]);
  });

  it('returns an empty receipt for a pair who never shared a club-season', () => {
    expect(receiptsBetween(graph, 'a', 'd')).toEqual([]);
  });

  it('measures distance in links, so a direct teammate is one', () => {
    expect(distanceBetween(graph, 'a', 'b')).toBe(1);
    expect(distanceBetween(graph, 'a', 'd')).toBe(2);
  });

  it('reports an unreachable pair as infinite rather than guessing', () => {
    expect(distanceBetween(graph, 'a', 'e')).toBe(Number.POSITIVE_INFINITY);
  });

  it('orders the pool by appearances, so the daily draw favours long careers', () => {
    // `c` has two seasons, so it outranks `a`, `b` and `d`; `e` played five games.
    expect(graph.order[0]).toBe('c');
    expect(graph.order[graph.order.length - 1]).toBe('e');
  });
});

describe('the grade', () => {
  it('is a full five at par and loses one block per player over', () => {
    expect(gradeOf(1, 1)).toBe(5);
    expect(gradeOf(2, 1)).toBe(4);
    expect(gradeOf(3, 1)).toBe(3);
    expect(gradeOf(4, 1)).toBe(2);
  });

  it('floors at one block, so a long chain cannot grade below the scale', () => {
    expect(gradeOf(9, 1)).toBe(1);
    expect(gradeOf(20, 1)).toBe(1);
  });
});
