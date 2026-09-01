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
  { rank: 16, name: 'alex', points: 135 },
  { rank: 17, name: 'ben', points: 133 },
  { rank: 18, name: 'cara', points: 131 },
  { rank: 19, name: 'dara', points: 129 },
  { rank: 20, name: 'elio', points: 127 },
  { rank: 21, name: 'farah', points: 125 },
  { rank: 22, name: 'gabe', points: 123 },
  { rank: 23, name: 'haru', points: 121 },
  { rank: 24, name: 'iris', points: 119 },
  { rank: 25, name: 'jalen', points: 117 },
  { rank: 26, name: 'kara', points: 115 },
  { rank: 27, name: 'leo', points: 113 },
  { rank: 28, name: 'maya', points: 111 },
  { rank: 29, name: 'noah', points: 109 },
  { rank: 30, name: 'omar', points: 107 },
  { rank: 31, name: 'piper', points: 105 },
  { rank: 32, name: 'quinn', points: 103 },
  { rank: 33, name: 'ryan', points: 101 },
  { rank: 34, name: 'sara', points: 99 },
  { rank: 35, name: 'tara', points: 97 },
  { rank: 36, name: 'uma', points: 95 },
  { rank: 37, name: 'victor', points: 93 },
  { rank: 38, name: 'wren', points: 91 },
  { rank: 39, name: 'xena', points: 89 },
  { rank: 40, name: 'yara', points: 87 },
  { rank: 41, name: 'zane', points: 85 },
  { rank: 42, name: 'aaron', points: 83 },
  { rank: 43, name: 'bella', points: 81 },
  { rank: 44, name: 'chris', points: 79 },
  { rank: 45, name: 'dana', points: 77 },
  { rank: 46, name: 'ezra', points: 75 },
  { rank: 47, name: 'finn', points: 73 },
  { rank: 48, name: 'gina', points: 71 },
  { rank: 49, name: 'hugo', points: 69 },
  { rank: 50, name: 'ivy', points: 67 },
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
  { rank: 16, name: 'alex', points: 142 },
  { rank: 17, name: 'ben', points: 138 },
  { rank: 18, name: 'cara', points: 134 },
  { rank: 19, name: 'dara', points: 130 },
  { rank: 20, name: 'elio', points: 126 },
  { rank: 21, name: 'farah', points: 122 },
  { rank: 22, name: 'gabe', points: 118 },
  { rank: 23, name: 'haru', points: 114 },
  { rank: 24, name: 'iris', points: 110 },
  { rank: 25, name: 'jalen', points: 106 },
  { rank: 26, name: 'kara', points: 102 },
  { rank: 27, name: 'leo', points: 98 },
  { rank: 28, name: 'maya', points: 94 },
  { rank: 29, name: 'noah', points: 90 },
  { rank: 30, name: 'omar', points: 86 },
  { rank: 31, name: 'piper', points: 82 },
  { rank: 32, name: 'quinn', points: 78 },
  { rank: 33, name: 'ryan', points: 74 },
  { rank: 34, name: 'sara', points: 70 },
  { rank: 35, name: 'tara', points: 66 },
  { rank: 36, name: 'uma', points: 62 },
  { rank: 37, name: 'victor', points: 58 },
  { rank: 38, name: 'wren', points: 54 },
  { rank: 39, name: 'xena', points: 50 },
  { rank: 40, name: 'yara', points: 46 },
  { rank: 41, name: 'zane', points: 42 },
  { rank: 42, name: 'aaron', points: 38 },
  { rank: 43, name: 'bella', points: 34 },
  { rank: 44, name: 'chris', points: 30 },
  { rank: 45, name: 'dana', points: 26 },
  { rank: 46, name: 'ezra', points: 22 },
  { rank: 47, name: 'finn', points: 18 },
  { rank: 48, name: 'gina', points: 14 },
  { rank: 49, name: 'hugo', points: 10 },
  { rank: 50, name: 'ivy', points: 6 },
];

export const mockUserRankWeightedNumber = 9;
export const mockUserPointsWeighted = 221;
