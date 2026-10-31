import { describe, expect, it } from 'vitest';
import { selectSlateGames, toCardGame, toCardTeams, type SlateGame } from './slate';

/**
 * Which games a slate day contains, and how a row becomes a card.
 *
 * Pure functions, so every case here is an exact set of rows and an exact instant.
 */

function game(overrides: Partial<SlateGame> & { gameId: string }): SlateGame {
  return {
    gameStatus: 1,
    gameDate: '2026-10-27',
    gameDateTimeUTC: new Date('2026-10-27T23:30:00.000Z'),
    awayTeamTricode: 'BKN',
    awayTeamCity: 'Brooklyn',
    awayTeamName: 'Nets',
    homeTeamTricode: 'BOS',
    homeTeamCity: 'Boston',
    homeTeamName: 'Celtics',
    seriesText: null,
    ...overrides,
  };
}

/** 9 a.m. ET on 27 October: the moment a New York guild posts. */
const MORNING = new Date('2026-10-27T13:00:00.000Z');
const ET_KEY = '2026-10-27';

describe('slate selection', () => {
  it('keeps only scheduled games', () => {
    const games = [
      game({ gameId: 'scheduled' }),
      game({ gameId: 'live', gameStatus: 2 }),
      game({ gameId: 'final', gameStatus: 3 }),
      game({ gameId: 'postponed', gameStatus: 0 }),
    ];

    expect(selectSlateGames(games, ET_KEY, MORNING).map((row) => row.gameId)).toEqual([
      'scheduled',
    ]);
  });

  it('keeps only games that have not tipped off', () => {
    const games = [
      game({ gameId: 'later', gameDateTimeUTC: new Date('2026-10-27T23:30:00.000Z') }),
      game({ gameId: 'tip-off-now', gameDateTimeUTC: MORNING }),
      // 00:30 ET on the 27th: the same slate day, already under way.
      game({ gameId: 'earlier', gameDateTimeUTC: new Date('2026-10-27T04:30:00.000Z') }),
    ];

    expect(selectSlateGames(games, ET_KEY, MORNING).map((row) => row.gameId)).toEqual(['later']);
  });

  it('keeps only games the ET date key puts on this day', () => {
    const games = [
      game({ gameId: 'today' }),
      // 03:00 UTC on the 28th is 11 p.m. ET on the 27th: still today's slate.
      game({ gameId: 'late-today', gameDateTimeUTC: new Date('2026-10-28T03:00:00.000Z') }),
      // 23:00 UTC on the 26th is 7 p.m. ET on the 26th: yesterday.
      game({ gameId: 'yesterday', gameDate: '2026-10-26' }),
    ];

    expect(selectSlateGames(games, ET_KEY, MORNING).map((row) => row.gameId)).toEqual([
      'today',
      'late-today',
    ]);
  });

  it('keys on the tip-off when the schedule row has no date', () => {
    const games = [
      game({
        gameId: 'undated',
        gameDate: null,
        gameDateTimeUTC: new Date('2026-10-28T02:00:00.000Z'),
      }),
      game({
        gameId: 'wrong-day',
        gameDate: null,
        gameDateTimeUTC: new Date('2026-10-29T02:00:00.000Z'),
      }),
    ];

    expect(selectSlateGames(games, ET_KEY, MORNING).map((row) => row.gameId)).toEqual(['undated']);
  });

  it('orders by tip-off, earliest first', () => {
    const games = [
      game({ gameId: 'por-lal', gameDateTimeUTC: new Date('2026-10-28T03:00:00.000Z') }),
      game({ gameId: 'bkn-bos', gameDateTimeUTC: new Date('2026-10-27T23:30:00.000Z') }),
      game({ gameId: 'det-nyk', gameDateTimeUTC: new Date('2026-10-28T00:00:00.000Z') }),
    ];

    expect(selectSlateGames(games, ET_KEY, MORNING).map((row) => row.gameId)).toEqual([
      'bkn-bos',
      'det-nyk',
      'por-lal',
    ]);
  });

  it('is empty on a day with no games', () => {
    expect(selectSlateGames([], ET_KEY, MORNING)).toEqual([]);
    expect(selectSlateGames([game({ gameId: 'x' })], '2026-10-25', MORNING)).toEqual([]);
  });
});

describe('a schedule row as a card', () => {
  it('carries the names, tricodes, and tip-off the card renders', () => {
    expect(toCardGame(game({ gameId: 'g1' }))).toEqual({
      id: 'g1',
      awayTeam: 'Brooklyn Nets',
      homeTeam: 'Boston Celtics',
      awayTricode: 'BKN',
      homeTricode: 'BOS',
      gameDateTime: '2026-10-27T23:30:00.000Z',
      seriesText: null,
    });
  });

  it('falls back to the tricode when the schedule has no name', () => {
    const card = toCardGame(
      game({
        gameId: 'g1',
        awayTeamCity: null,
        awayTeamName: null,
        homeTeamCity: null,
        homeTeamName: null,
      }),
    );
    expect(card.awayTeam).toBe('BKN');
    expect(card.homeTeam).toBe('BOS');
  });

  it('has no tip-off when the row has none', () => {
    expect(toCardGame(game({ gameId: 'g1', gameDateTimeUTC: null })).gameDateTime).toBe('');
  });

  it('takes the teams table where it has the team', () => {
    const teams = new Map([
      [
        'BOS',
        { tricode: 'BOS', name: 'Boston Celtics', logoUrl: 'https://cdn/BOS.svg', record: null },
      ],
    ]);

    const sides = toCardTeams(game({ gameId: 'g1' }), teams);
    expect(sides.home).toEqual({
      tricode: 'BOS',
      name: 'Boston Celtics',
      logoUrl: 'https://cdn/BOS.svg',
      record: null,
      points: null,
    });
    // Brooklyn is not in the table: the card still renders, from the schedule.
    expect(sides.away).toEqual({
      tricode: 'BKN',
      name: 'Brooklyn Nets',
      logoUrl: null,
      record: null,
      points: null,
    });
  });

  it('renders a game with no tricodes at all', () => {
    const sides = toCardTeams(
      game({ gameId: 'g1', awayTeamTricode: null, homeTeamTricode: null }),
      new Map(),
    );
    expect(sides.away.tricode).toBe('');
    expect(sides.away.name).toBe('Brooklyn Nets');
    expect(sides.home.name).toBe('Boston Celtics');
  });
});
