/*
 * Mock dashboard data — kept temporarily for the sections without backend
 * endpoints yet (user stats: rank, predictions, accuracy, leaderboards).
 * Real data flows through the API hooks (useTeamRecord, useUpcomingGames,
 * useTopPlayers, useStandings) keyed on the session team.
 */

export const mockUserRankNumber = 12;
export const mockUserRank = `${mockUserRankNumber}th`;
export const mockUserPredictions = { correct: 20, wrong: 10 };
export const mockAccuracy = '67%';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
}

/** Dummy standard leaderboard — ranked by prediction points. */
export const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: 'amir', points: 248 },
  { rank: 2, name: 'yuki', points: 231 },
  { rank: 3, name: 'marcus', points: 219 },
  { rank: 4, name: 'diego', points: 205 },
  { rank: 5, name: 'priya', points: 198 },
  { rank: 6, name: 'lena', points: 186 },
  { rank: 7, name: 'tomas', points: 174 },
  { rank: 8, name: 'femi', points: 161 },
  { rank: 9, name: 'hana', points: 149 },
  { rank: 10, name: 'oleg', points: 147 },
  { rank: 11, name: 'mira', points: 145 },
  { rank: 12, name: 'kai', points: 143 },
  { rank: 13, name: 'nina', points: 141 },
  { rank: 14, name: 'rashid', points: 139 },
  { rank: 15, name: 'sofia', points: 137 },
];

export const mockUserPoints = 144;

/** Dummy weighted leaderboard — same users, re-ranked by weighted points. */
export const mockWeightedLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: 'priya', points: 312 },
  { rank: 2, name: 'lena', points: 298 },
  { rank: 3, name: 'amir', points: 285 },
  { rank: 4, name: 'hana', points: 274 },
  { rank: 5, name: 'yuki', points: 261 },
  { rank: 6, name: 'marcus', points: 250 },
  { rank: 7, name: 'femi', points: 238 },
  { rank: 8, name: 'tomas', points: 226 },
  { rank: 9, name: 'diego', points: 215 },
  { rank: 10, name: 'mira', points: 203 },
  { rank: 11, name: 'oleg', points: 192 },
  { rank: 12, name: 'kai', points: 181 },
  { rank: 13, name: 'nina', points: 170 },
  { rank: 14, name: 'sofia', points: 159 },
  { rank: 15, name: 'rashid', points: 148 },
];

export const mockUserRankWeightedNumber = 9;
export const mockUserPointsWeighted = 221;
