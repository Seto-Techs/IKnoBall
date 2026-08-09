/*
 * Mock dashboard data — kept temporarily for the sections without backend
 * endpoints yet (user stats: rank, predictions, accuracy) and the HeroBanner
 * "Last 5" strip. Real data flows through the API hooks (useTeamRecord,
 * useUpcomingGames, useTopPlayers, useStandings) keyed on the session team.
 */

export const mockUserRank = '12th';
export const mockUserPredictions = { correct: 20, wrong: 10 };
export const mockAccuracy = '67%';

export interface RecentGame {
  opponent: string;
  result: 'W' | 'L';
}

export const mockLastFive: RecentGame[] = [
  { opponent: 'Houston Rockets', result: 'W' },
  { opponent: 'Los Angeles Lakers', result: 'L' },
  { opponent: 'Phoenix Suns', result: 'W' },
  { opponent: 'Denver Nuggets', result: 'L' },
  { opponent: 'Dallas Mavericks', result: 'W' },
];
