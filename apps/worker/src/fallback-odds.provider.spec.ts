import { describe, expect, it } from 'vitest';
import type { OddsGame, OddsProvider } from '@iknoball/predictions';
import { FallbackOddsProvider } from './fallback-odds.provider';

function game(homeTeamId: number, awayTeamId: number, bookName: string): OddsGame {
  return {
    gameId: null,
    homeTeamId,
    awayTeamId,
    books: [
      {
        bookId: bookName.toLowerCase(),
        bookName,
        countryCode: 'US',
        home: 1.9,
        away: 1.95,
        homeOpening: null,
        awayOpening: null,
      },
    ],
  };
}

function stub(games: OddsGame[] | Error): OddsProvider {
  return {
    fetchMoneyline: async () => {
      if (games instanceof Error) throw games;
      return games;
    },
  };
}

function build(cdn: OddsProvider, pinnacle: OddsProvider): FallbackOddsProvider {
  return new FallbackOddsProvider(cdn as never, pinnacle as never);
}

// Toronto/Miami and Denver/Utah — two distinct team pairs.
const GAME_A = game(1610612761, 1610612748, 'Pinnacle');
const GAME_B = game(1610612743, 1610612762, 'FanDuel');

describe('FallbackOddsProvider', () => {
  it('keeps the Pinnacle price and adds only the games Pinnacle did not cover', async () => {
    const provider = build(stub([GAME_B]), stub([GAME_A]));

    const games = await provider.fetchMoneyline();

    expect(games).toEqual([GAME_A, GAME_B]);
  });

  it('prefers Pinnacle when both sources price the same game', async () => {
    const cdnSameGame = game(1610612761, 1610612748, 'FanDuel');
    const provider = build(stub([cdnSameGame]), stub([GAME_A]));

    const games = await provider.fetchMoneyline();

    expect(games).toEqual([GAME_A]);
  });

  it('falls through to the CDN when Pinnacle is down', async () => {
    const provider = build(stub([GAME_B]), stub(new Error('ENOTFOUND')));

    const games = await provider.fetchMoneyline();

    expect(games).toEqual([GAME_B]);
  });

  it('still returns Pinnacle prices when the CDN is down', async () => {
    const provider = build(stub(new Error('403')), stub([GAME_A]));

    const games = await provider.fetchMoneyline();

    expect(games).toEqual([GAME_A]);
  });

  it('returns nothing when both sources are empty', async () => {
    const provider = build(stub([]), stub([]));

    await expect(provider.fetchMoneyline()).resolves.toEqual([]);
  });

  it('drops a fallback game it cannot identify, since it can never be matched to the schedule', async () => {
    const unidentified: OddsGame = { gameId: null, homeTeamId: null, awayTeamId: null, books: [] };
    const provider = build(stub([unidentified]), stub([]));

    const games = await provider.fetchMoneyline();

    expect(games).toEqual([]);
  });
});
