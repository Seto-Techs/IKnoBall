import type { Game, PlayerStat, TeamRecord } from './api';

/*
 * Dummy dashboard data — replace with the API hooks (useTeamRecord,
 * useUpcomingGames, useTopPlayers) once the UI is final.
 * Mirrors the Figma mock: Golden State Warriors at 24-0, 1st in the West,
 * Houston Rockets up next.
 */

const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString();

export const mockRecord: TeamRecord = {
  wins: 24,
  losses: 0,
  conference: 'Western Conference',
  division: 'Pacific Division',
};

export const mockUserRank = '12th';
export const mockUserPredictions = { correct: 20, wrong: 10 };
export const mockWinProbability = '80%';
export const mockAccuracy = '67%';

export interface StandingEntry {
  abbr: string;
  wins: number;
  losses: number;
}

/**
 * All 30 NBA teams with mock W/L records — used by the conference
 * standings sidebar. Sorted by conference then win-loss within each.
 */
export const mockStandings: StandingEntry[] = [
  /* Western Conference */
  { abbr: 'GSW', wins: 24, losses: 0 },
  { abbr: 'OKC', wins: 20, losses: 5 },
  { abbr: 'MIN', wins: 19, losses: 6 },
  { abbr: 'DEN', wins: 18, losses: 7 },
  { abbr: 'LAL', wins: 18, losses: 8 },
  { abbr: 'DAL', wins: 17, losses: 9 },
  { abbr: 'LAC', wins: 16, losses: 9 },
  { abbr: 'PHX', wins: 15, losses: 10 },
  { abbr: 'MEM', wins: 14, losses: 11 },
  { abbr: 'HOU', wins: 13, losses: 12 },
  { abbr: 'SAC', wins: 12, losses: 13 },
  { abbr: 'NOP', wins: 10, losses: 15 },
  { abbr: 'POR', wins: 9, losses: 16 },
  { abbr: 'SAS', wins: 7, losses: 18 },
  { abbr: 'UTA', wins: 5, losses: 20 },
  /* Eastern Conference */
  { abbr: 'BOS', wins: 22, losses: 2 },
  { abbr: 'CLE', wins: 21, losses: 4 },
  { abbr: 'MIL', wins: 19, losses: 6 },
  { abbr: 'NYK', wins: 18, losses: 7 },
  { abbr: 'MIA', wins: 17, losses: 8 },
  { abbr: 'IND', wins: 16, losses: 9 },
  { abbr: 'PHI', wins: 15, losses: 10 },
  { abbr: 'ATL', wins: 14, losses: 11 },
  { abbr: 'ORL', wins: 13, losses: 12 },
  { abbr: 'CHI', wins: 11, losses: 14 },
  { abbr: 'BRK', wins: 10, losses: 15 },
  { abbr: 'TOR', wins: 9, losses: 16 },
  { abbr: 'CHO', wins: 8, losses: 17 },
  { abbr: 'DET', wins: 6, losses: 19 },
  { abbr: 'WAS', wins: 4, losses: 21 },
];

export const mockGames: Game[] = [
  {
    id: 'mock-1',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Houston Rockets',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(1),
    status: 'Scheduled',
  },
  {
    id: 'mock-2',
    homeTeam: 'Golden State Warriors',
    homeScore: 102,
    awayTeam: 'Los Angeles Lakers',
    awayScore: 98,
    gameDateTime: day(0),
    status: 'Live',
  },
  {
    id: 'mock-3',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Phoenix Suns',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(4),
    status: 'Scheduled',
  },
  {
    id: 'mock-4',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Denver Nuggets',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(7),
    status: 'Scheduled',
  },
  {
    id: 'mock-5',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Dallas Mavericks',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(10),
    status: 'Scheduled',
  },
];

export const mockPlayers: PlayerStat[] = [
  {
    id: '201939',
    name: 'Stephen Curry',
    position: 'PG',
    points: 28.7,
    rebounds: 5.1,
    assists: 6.9,
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/201939.png',
  },
  {
    id: '202691',
    name: 'Klay Thompson',
    position: 'SG',
    points: 17.9,
    rebounds: 3.3,
    assists: 2.4,
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/202691.png',
  },
  {
    id: '203110',
    name: 'Draymond Green',
    position: 'PF',
    points: 8.5,
    rebounds: 7.2,
    assists: 6.5,
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203110.png',
  },
  {
    id: '203952',
    name: 'Andrew Wiggins',
    position: 'SF',
    points: 16.4,
    rebounds: 4.6,
    assists: 2.1,
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203952.png',
  },
  {
    id: '1630228',
    name: 'Jonathan Kuminga',
    position: 'PF',
    points: 14.2,
    rebounds: 5.8,
    assists: 2.2,
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630228.png',
  },
];

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
