import { describe, expect, it } from 'vitest';
import {
  collapseDashboardRowsBySeason,
  splitDashboardRowsBySeason,
  type PlayerDashboardRow,
} from './player-season.processor';

/** One ByYear dashboard row, defaulted to a full season of a single team. */
function row(over: Partial<PlayerDashboardRow>): PlayerDashboardRow {
  return {
    GROUP_SET: 'Season',
    GROUP_VALUE: '2025-26',
    TEAM_ID: 1610612759,
    TEAM_ABBREVIATION: 'SAS',
    MAX_GAME_DATE: '2026-04-12',
    GP: 60,
    W: 40,
    L: 20,
    W_PCT: 0.667,
    MIN: 1800,
    FGM: 500,
    FGA: 1000,
    FG_PCT: 0.5,
    FG3M: 100,
    FG3A: 300,
    FG3_PCT: 0.333,
    FTM: 200,
    FTA: 250,
    FT_PCT: 0.8,
    OREB: 100,
    DREB: 400,
    REB: 500,
    AST: 300,
    TOV: 150,
    STL: 60,
    BLK: 50,
    BLKA: 30,
    PF: 120,
    PFD: 100,
    PTS: 1300,
    PLUS_MINUS: 120,
    NBA_FANTASY_PTS: 2000,
    DD2: 10,
    TD3: 1,
    WNBA_FANTASY_PTS: null,
    ...over,
  } as PlayerDashboardRow;
}

describe('splitDashboardRowsBySeason', () => {
  it('keeps the per-team rows of a season the player moved during', () => {
    const splits = splitDashboardRowsBySeason([
      row({ TEAM_ABBREVIATION: 'TOT', GP: 60, PTS: 1300 }),
      row({ TEAM_ABBREVIATION: 'SAS', TEAM_ID: 1610612759, GP: 40, PTS: 900 }),
      row({ TEAM_ABBREVIATION: 'LAL', TEAM_ID: 1610612747, GP: 20, PTS: 400 }),
    ]);

    expect(splits).toHaveLength(1);
    expect(splits[0].season).toBe('2025-26');
    expect(splits[0].teams).toEqual([
      {
        teamAbbr: 'SAS',
        totals: expect.objectContaining({ gp: 40, ptsTotal: 900, ptsPerGame: 22.5 }),
      },
      {
        teamAbbr: 'LAL',
        totals: expect.objectContaining({ gp: 20, ptsTotal: 400, ptsPerGame: 20 }),
      },
    ]);
  });

  it('skips the combined TOT row, which the season row already holds', () => {
    const splits = splitDashboardRowsBySeason([
      row({ TEAM_ABBREVIATION: 'TOT', GP: 60, PTS: 1300 }),
      row({ TEAM_ABBREVIATION: 'SAS', GP: 40 }),
      row({ TEAM_ABBREVIATION: 'LAL', GP: 20 }),
    ]);

    expect(splits[0].teams.map((t) => t.teamAbbr)).toEqual(['SAS', 'LAL']);
  });

  it('leaves a single-team season out, since nothing would open up', () => {
    const splits = splitDashboardRowsBySeason([
      row({ GROUP_VALUE: '2024-25', TEAM_ABBREVIATION: 'SAS' }),
      row({ GROUP_VALUE: '2025-26', TEAM_ABBREVIATION: 'TOT' }),
      row({ GROUP_VALUE: '2025-26', TEAM_ABBREVIATION: 'SAS' }),
    ]);

    expect(splits).toEqual([]);
  });

  it('splits only the seasons the player moved during', () => {
    const splits = splitDashboardRowsBySeason([
      row({ GROUP_VALUE: '2023-24', TEAM_ABBREVIATION: 'SAS' }),
      row({ GROUP_VALUE: '2024-25', TEAM_ABBREVIATION: 'TOT', GP: 55 }),
      row({ GROUP_VALUE: '2024-25', TEAM_ABBREVIATION: 'SAS', GP: 35 }),
      row({ GROUP_VALUE: '2024-25', TEAM_ABBREVIATION: 'LAL', GP: 20 }),
      row({ GROUP_VALUE: '2025-26', TEAM_ABBREVIATION: 'SAS' }),
    ]);

    expect(splits).toHaveLength(1);
    expect(splits[0].season).toBe('2024-25');
    expect(splits[0].teams.map((t) => t.teamAbbr)).toEqual(['SAS', 'LAL']);
  });

  it('ignores a row with no games, matching the season collapse', () => {
    const splits = splitDashboardRowsBySeason([
      row({ TEAM_ABBREVIATION: 'SAS', GP: 40 }),
      row({ TEAM_ABBREVIATION: 'LAL', GP: 20 }),
      row({ TEAM_ABBREVIATION: 'DEN', GP: 0 }),
    ]);

    expect(splits[0].teams.map((t) => t.teamAbbr)).toEqual(['SAS', 'LAL']);
  });
});

describe('collapseDashboardRowsBySeason alongside the splits', () => {
  it('still stores one combined row for a season it also splits', () => {
    const rows = [
      row({ TEAM_ABBREVIATION: 'SAS', GP: 40, PTS: 900 }),
      row({ TEAM_ABBREVIATION: 'LAL', GP: 20, PTS: 400 }),
      row({ TEAM_ABBREVIATION: 'TOT', GP: 60, PTS: 1300 }),
    ];

    const collapsed = collapseDashboardRowsBySeason(rows);

    expect(collapsed).toHaveLength(1);
    // The TOT row wins over whichever per-team row came last.
    expect(collapsed[0].totals).toMatchObject({ gp: 60, ptsTotal: 1300 });
    expect(splitDashboardRowsBySeason(rows)[0].teams).toHaveLength(2);
  });
});
