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

export const mockUserRankNumber = 12;
export const mockUserRank = `${mockUserRankNumber}th`;
export const mockUserPredictions = { correct: 20, wrong: 10 };
export const mockWinProbability = '80%';
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

export const mockTeamSeason: Game[] = [
  {
    id: 'season-1',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Houston Rockets',
    gameDateTime: day(1),
    status: 'Scheduled',
  },
  {
    id: 'season-2',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Phoenix Suns',
    gameDateTime: day(4),
    status: 'Scheduled',
  },
  {
    id: 'season-3',
    homeTeam: 'Denver Nuggets',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(7),
    status: 'Scheduled',
  },
  {
    id: 'season-4',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Dallas Mavericks',
    gameDateTime: day(10),
    status: 'Scheduled',
  },
  {
    id: 'season-5',
    homeTeam: 'Los Angeles Clippers',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(13),
    status: 'Scheduled',
  },
  {
    id: 'season-6',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Oklahoma City Thunder',
    gameDateTime: day(16),
    status: 'Scheduled',
  },
  {
    id: 'season-7',
    homeTeam: 'Memphis Grizzlies',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(19),
    status: 'Scheduled',
  },
  {
    id: 'season-8',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Sacramento Kings',
    gameDateTime: day(22),
    status: 'Scheduled',
  },
  {
    id: 'season-9',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Los Angeles Lakers',
    gameDateTime: day(25),
    status: 'Scheduled',
  },
  {
    id: 'season-10',
    homeTeam: 'Portland Trail Blazers',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(28),
    status: 'Scheduled',
  },
  {
    id: 'season-11',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Minnesota Timberwolves',
    gameDateTime: day(31),
    status: 'Scheduled',
  },
  {
    id: 'season-12',
    homeTeam: 'New Orleans Pelicans',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(34),
    status: 'Scheduled',
  },
  {
    id: 'season-13',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'San Antonio Spurs',
    gameDateTime: day(37),
    status: 'Scheduled',
  },
  {
    id: 'season-14',
    homeTeam: 'Utah Jazz',
    awayTeam: 'Golden State Warriors',
    gameDateTime: day(40),
    status: 'Scheduled',
  },
  {
    id: 'season-15',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Houston Rockets',
    gameDateTime: day(43),
    status: 'Scheduled',
  },
  {
    id: 'season-16',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Phoenix Suns',
    gameDateTime: day(46),
    status: 'Scheduled',
  },
];

export const mockLeagueToday: Game[] = [
  {
    id: 'today-1',
    homeTeam: 'Golden State Warriors',
    awayTeam: 'Los Angeles Lakers',
    homeScore: 102,
    awayScore: 98,
    gameDateTime: day(0),
    status: 'Live',
  },
  {
    id: 'today-2',
    homeTeam: 'Boston Celtics',
    awayTeam: 'Miami Heat',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
    status: 'Scheduled',
  },
  {
    id: 'today-3',
    homeTeam: 'Milwaukee Bucks',
    awayTeam: 'New York Knicks',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
    status: 'Scheduled',
  },
  {
    id: 'today-4',
    homeTeam: 'Denver Nuggets',
    awayTeam: 'Oklahoma City Thunder',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
    status: 'Scheduled',
  },
  {
    id: 'today-5',
    homeTeam: 'Cleveland Cavaliers',
    awayTeam: 'Philadelphia 76ers',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
    status: 'Scheduled',
  },
  {
    id: 'today-6',
    homeTeam: 'Dallas Mavericks',
    awayTeam: 'Minnesota Timberwolves',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
    status: 'Scheduled',
  },
  {
    id: 'today-7',
    homeTeam: 'Phoenix Suns',
    awayTeam: 'Los Angeles Clippers',
    homeScore: null,
    awayScore: null,
    gameDateTime: day(0),
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
    team: 'GSW',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/201939.png',
  },
  {
    id: '202691',
    name: 'Klay Thompson',
    position: 'SG',
    points: 17.9,
    rebounds: 3.3,
    assists: 2.4,
    team: 'GSW',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/202691.png',
  },
  {
    id: '203110',
    name: 'Draymond Green',
    position: 'PF',
    points: 8.5,
    rebounds: 7.2,
    assists: 6.5,
    team: 'GSW',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203110.png',
  },
  {
    id: '203952',
    name: 'Andrew Wiggins',
    position: 'SF',
    points: 16.4,
    rebounds: 4.6,
    assists: 2.1,
    team: 'GSW',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203952.png',
  },
  {
    id: '1630228',
    name: 'Jonathan Kuminga',
    position: 'PF',
    points: 14.2,
    rebounds: 5.8,
    assists: 2.2,
    team: 'GSW',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630228.png',
  },
  {
    id: '1629029',
    name: 'Luka Doncic',
    position: 'PG',
    points: 33.9,
    rebounds: 9.2,
    assists: 9.8,
    team: 'DAL',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629029.png',
  },
  {
    id: '203507',
    name: 'Giannis Antetokounmpo',
    position: 'PF',
    points: 30.4,
    rebounds: 11.5,
    assists: 6.5,
    team: 'MIL',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203507.png',
  },
  {
    id: '1628983',
    name: 'Shai Gilgeous-Alexander',
    position: 'PG',
    points: 30.1,
    rebounds: 5.6,
    assists: 6.2,
    team: 'OKC',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1628983.png',
  },
  {
    id: '203999',
    name: 'Nikola Jokic',
    position: 'C',
    points: 26.4,
    rebounds: 12.3,
    assists: 9.1,
    team: 'DEN',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png',
  },
  {
    id: '1627734',
    name: 'Domantas Sabonis',
    position: 'C',
    points: 19.4,
    rebounds: 13.2,
    assists: 8.2,
    team: 'SAC',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1627734.png',
  },
  {
    id: '203497',
    name: 'Rudy Gobert',
    position: 'C',
    points: 13.7,
    rebounds: 12.9,
    assists: 1.3,
    team: 'MIN',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203497.png',
  },
  {
    id: '1630169',
    name: 'Tyrese Haliburton',
    position: 'PG',
    points: 20.1,
    rebounds: 3.9,
    assists: 10.9,
    team: 'IND',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630169.png',
  },
  {
    id: '1629027',
    name: 'Trae Young',
    position: 'PG',
    points: 25.7,
    rebounds: 2.8,
    assists: 10.8,
    team: 'ATL',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629027.png',
  },
  {
    id: '203954',
    name: 'Joel Embiid',
    position: 'C',
    points: 34.7,
    rebounds: 11.0,
    assists: 5.6,
    team: 'PHI',
    imageUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/203954.png',
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
