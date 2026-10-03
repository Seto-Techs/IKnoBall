import { describe, expect, it } from 'vitest';
import {
  americanToDecimal,
  joinPinnaclePayload,
  parsePinnacleMatchups,
  parsePinnacleMoneylines,
  pinnacleLeagueForGameId,
  PINNACLE_LEAGUE,
} from '@iknoball/predictions';

describe('pinnacleLeagueForGameId', () => {
  it('routes preseason games to the preseason league', () => {
    expect(pinnacleLeagueForGameId('0012600009')).toBe(PINNACLE_LEAGUE.preseason);
  });

  it('routes regular-season games to the main league', () => {
    expect(pinnacleLeagueForGameId('0022500001')).toBe(PINNACLE_LEAGUE.regular);
  });

  it('keeps playoffs and play-in on the main league', () => {
    expect(pinnacleLeagueForGameId('0042500405')).toBe(PINNACLE_LEAGUE.regular);
    expect(pinnacleLeagueForGameId('0052500001')).toBe(PINNACLE_LEAGUE.regular);
  });
});

describe('americanToDecimal', () => {
  it('converts positive prices', () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(americanToDecimal(100)).toBeCloseTo(2, 10);
  });

  it('converts negative prices', () => {
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 10);
    expect(americanToDecimal(-175)).toBeCloseTo(1.5714285714, 8);
  });

  it('rejects values that cannot be a price', () => {
    expect(americanToDecimal(0)).toBeNull();
    expect(americanToDecimal(null)).toBeNull();
    expect(americanToDecimal(Number.NaN)).toBeNull();
  });
});

describe('parsePinnacleMatchups', () => {
  it('reads the two-team game with home and away alignment', () => {
    const matchups = parsePinnacleMatchups([
      {
        id: 1637443874,
        startTime: '2026-10-21T23:00:00Z',
        participants: [
          { alignment: 'home', name: 'Washington Wizards' },
          { alignment: 'away', name: 'Milwaukee Bucks' },
        ],
      },
    ]);

    expect(matchups).toEqual([
      {
        matchupId: 1637443874,
        startTime: '2026-10-21T23:00:00Z',
        homeTeamName: 'Washington Wizards',
        awayTeamName: 'Milwaukee Bucks',
      },
    ]);
  });

  it('drops props, which have no home/away alignment', () => {
    const matchups = parsePinnacleMatchups([
      {
        id: 1636918885,
        participants: [
          { alignment: 'neutral', name: 'Yes' },
          { alignment: 'neutral', name: 'No' },
        ],
      },
    ]);

    expect(matchups).toEqual([]);
  });

  it('drops entries without a usable id or a full team pair', () => {
    expect(parsePinnacleMatchups([{ participants: [] }])).toEqual([]);
    expect(
      parsePinnacleMatchups([{ id: 1, participants: [{ alignment: 'home', name: 'Only Home' }] }]),
    ).toEqual([]);
  });

  it('tolerates a non-array payload', () => {
    expect(parsePinnacleMatchups(null)).toEqual([]);
    expect(parsePinnacleMatchups({})).toEqual([]);
  });
});

describe('parsePinnacleMoneylines', () => {
  it('prices a full-game moneyline by designation', () => {
    const prices = parsePinnacleMoneylines([
      {
        matchupId: 1637443874,
        type: 'moneyline',
        period: 0,
        prices: [
          { designation: 'home', price: -217 },
          { designation: 'away', price: 187 },
        ],
      },
    ]);

    expect(prices.get(1637443874)?.home).toBeCloseTo(1.4608294931, 8);
    expect(prices.get(1637443874)?.away).toBeCloseTo(2.87, 10);
  });

  it('ignores markets that are not full-game moneylines', () => {
    const prices = parsePinnacleMoneylines([
      { matchupId: 1, type: 'spread', period: 0, prices: [{ designation: 'home', price: -110 }] },
      { matchupId: 2, type: 'total', period: 0, prices: [{ designation: 'home', price: -110 }] },
      {
        matchupId: 3,
        type: 'moneyline',
        period: 1,
        prices: [
          { designation: 'home', price: -110 },
          { designation: 'away', price: -110 },
        ],
      },
    ]);

    expect(prices.size).toBe(0);
  });

  it('drops a prop market, whose legs carry participantId rather than designation', () => {
    const prices = parsePinnacleMoneylines([
      {
        matchupId: 1636918885,
        type: 'moneyline',
        period: 0,
        prices: [
          { participantId: 1636918886, price: 499 },
          { participantId: 1636918887, price: -666 },
        ],
      },
    ]);

    expect(prices.size).toBe(0);
  });

  it('drops a market missing one side', () => {
    const prices = parsePinnacleMoneylines([
      {
        matchupId: 7,
        type: 'moneyline',
        period: 0,
        prices: [{ designation: 'home', price: -110 }],
      },
    ]);

    expect(prices.size).toBe(0);
  });
});

describe('joinPinnaclePayload', () => {
  it('joins matchups to their moneyline and drops unpriced games', () => {
    const matchups = [
      {
        id: 1,
        startTime: '2026-10-03T23:00:00Z',
        participants: [
          { alignment: 'home', name: 'Toronto Raptors' },
          { alignment: 'away', name: 'Miami Heat' },
        ],
      },
      {
        id: 2,
        participants: [
          { alignment: 'home', name: 'Denver Nuggets' },
          { alignment: 'away', name: 'Utah Jazz' },
        ],
      },
    ];
    const markets = [
      {
        matchupId: 1,
        type: 'moneyline',
        period: 0,
        prices: [
          { designation: 'home', price: -175 },
          { designation: 'away', price: 142 },
        ],
      },
    ];

    const games = joinPinnaclePayload(matchups, markets);

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      matchupId: 1,
      homeTeamName: 'Toronto Raptors',
      awayTeamName: 'Miami Heat',
    });
    expect(games[0].home).toBeCloseTo(1.5714285714, 8);
    expect(games[0].away).toBeCloseTo(2.42, 10);
  });
});
