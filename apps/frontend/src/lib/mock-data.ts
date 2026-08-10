/*
 * Mock dashboard data — kept temporarily for the sections without backend
 * endpoints yet (user stats: rank, predictions, accuracy). Real data flows
 * through the API hooks (useTeamRecord, useUpcomingGames, useTopPlayers,
 * useStandings) keyed on the session team.
 */

export const mockUserRank = '12th';
export const mockUserPredictions = { correct: 20, wrong: 10 };
export const mockAccuracy = '67%';
