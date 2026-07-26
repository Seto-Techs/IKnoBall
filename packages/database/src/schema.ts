import { randomUUID } from 'node:crypto';
import { users } from './better-auth.schema.js';

export {
  account,
  session,
  users,
  verification,
} from './better-auth.schema.js';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(randomUUID);
const createdAt = () => timestamp('createdAt', { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp('updatedAt', { precision: 3 }).notNull().defaultNow();

export const scheduleTeamSide = pgEnum('ScheduleTeamSide', ['home', 'away']);
export const categoryType = pgEnum('CategoryType', ['income', 'expense']);

export const activityLogs = pgTable('activity_logs', {
  id: text('activity_log_id').primaryKey().$defaultFn(randomUUID), userId: text('user_id'), category: text('category').notNull(),
  activityName: text('activity_name').notNull(), entityType: text('entity_type').notNull(), entityId: text('entity_id').notNull(),
  isSuccess: boolean('is_success').notNull(), description: text('description'), metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
}, (table) => [index('activity_logs_entity_type_entity_id_idx').on(table.entityType, table.entityId), index('activity_logs_user_id_created_at_idx').on(table.userId, table.createdAt)]);

export const players = pgTable('players', {
  id: id(), externalId: text('externalId').notNull().unique(), firstName: text('firstName').notNull(), lastName: text('lastName').notNull(),
  displayName: text('displayName'), slug: text('slug'), position: text('position'), teamId: integer('teamId'), teamSlug: text('teamSlug'),
  isDefunct: boolean('isDefunct'), teamCity: text('teamCity'), teamName: text('teamName'), teamAbbr: text('teamAbbr'), jersey: text('jersey'),
  height: text('height'), weight: text('weight'), college: text('college'), country: text('country'), draftYear: integer('draftYear'),
  draftRound: integer('draftRound'), draftPick: integer('draftPick'), rosterStatus: doublePrecision('rosterStatus'), careerFrom: text('careerFrom'), careerTo: text('careerTo'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const teams = pgTable('teams', {
  id: id(), externalId: text('externalId').notNull().unique(), name: text('name').notNull(),
  fullName: text('fullName').notNull(), abbreviation: text('abbreviation').notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const playerSeasonStats = pgTable('player_season_stats', {
  id: id(), playerId: text('playerId').notNull().references(() => players.id), season: text('season').notNull(), gp: integer('gp'), wins: integer('wins'), losses: integer('losses'),
  fgPct: doublePrecision('fgPct'), fg3Pct: doublePrecision('fg3Pct'), ftPct: doublePrecision('ftPct'), ptsTotal: doublePrecision('ptsTotal'),
  rebTotal: doublePrecision('rebTotal'), astTotal: doublePrecision('astTotal'), ptsPerGame: doublePrecision('ptsPerGame'),
  rebPerGame: doublePrecision('rebPerGame'), astPerGame: doublePrecision('astPerGame'), statsTimeframe: text('statsTimeframe'), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique('player_season_stats_playerId_season_statsTimeframe_key').on(table.playerId, table.season, table.statsTimeframe), index('player_season_stats_playerId_idx').on(table.playerId)]);

export const scheduleDays = pgTable('schedule_days', {
  id: id(), gameDate: date('gameDate', { mode: 'string' }).notNull(), seasonYear: text('seasonYear').notNull(), leagueId: text('leagueId').notNull(),
  metaVersion: integer('metaVersion').notNull(), metaRequest: text('metaRequest').notNull(), metaTime: timestamp('metaTime', { precision: 3 }).notNull(), hash: text('hash').notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique('schedule_days_gameDate_seasonYear_leagueId_key').on(table.gameDate, table.seasonYear, table.leagueId), index('schedule_days_gameDate_idx').on(table.gameDate)]);

export const scheduleGames = pgTable('schedule_games', {
  id: id(), scheduleDayId: text('scheduleDayId').notNull().references(() => scheduleDays.id), gameId: text('gameId').notNull().unique(),
  gameDate: date('gameDate', { mode: 'string' }).notNull(), gameCode: text('gameCode').notNull(), gameStatus: integer('gameStatus').notNull(), gameStatusText: text('gameStatusText').notNull(), gameSequence: integer('gameSequence').notNull(),
  gameDateEst: timestamp('gameDateEst', { precision: 3 }), gameTimeEst: timestamp('gameTimeEst', { precision: 3 }), gameDateTimeEst: timestamp('gameDateTimeEst', { precision: 3 }), gameDateUTC: timestamp('gameDateUTC', { precision: 3 }), gameTimeUTC: timestamp('gameTimeUTC', { precision: 3 }), gameDateTimeUTC: timestamp('gameDateTimeUTC', { precision: 3 }), awayTeamTime: timestamp('awayTeamTime', { precision: 3 }), homeTeamTime: timestamp('homeTeamTime', { precision: 3 }),
  day: text('day'), monthNum: integer('monthNum'), weekNumber: integer('weekNumber'), weekName: text('weekName'), ifNecessary: text('ifNecessary'), seriesGameNumber: text('seriesGameNumber'), gameLabel: text('gameLabel'), gameSubLabel: text('gameSubLabel'), seriesText: text('seriesText'), arenaName: text('arenaName'), arenaState: text('arenaState'), arenaCity: text('arenaCity'), postponedStatus: text('postponedStatus'), branchLink: text('branchLink'), gameSubtype: text('gameSubtype'), isNeutral: boolean('isNeutral').notNull(),
  homeTeamId: integer('homeTeamId'), homeTeamName: text('homeTeamName'), homeTeamCity: text('homeTeamCity'), homeTeamTricode: text('homeTeamTricode'), homeTeamSlug: text('homeTeamSlug'), homeTeamWins: integer('homeTeamWins'), homeTeamLosses: integer('homeTeamLosses'), homeTeamScore: integer('homeTeamScore'), homeTeamSeed: integer('homeTeamSeed'),
  awayTeamId: integer('awayTeamId'), awayTeamName: text('awayTeamName'), awayTeamCity: text('awayTeamCity'), awayTeamTricode: text('awayTeamTricode'), awayTeamSlug: text('awayTeamSlug'), awayTeamWins: integer('awayTeamWins'), awayTeamLosses: integer('awayTeamLosses'), awayTeamScore: integer('awayTeamScore'), awayTeamSeed: integer('awayTeamSeed'), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [index('schedule_games_gameDate_idx').on(table.gameDate), index('schedule_games_scheduleDayId_idx').on(table.scheduleDayId)]);

export const schedulePointsLeaders = pgTable('schedule_points_leaders', {
  id: id(), scheduleGameId: text('scheduleGameId').notNull().references(() => scheduleGames.id), personId: integer('personId'), firstName: text('firstName'), lastName: text('lastName'), teamId: integer('teamId'), teamCity: text('teamCity'), teamName: text('teamName'), teamTricode: text('teamTricode'), points: doublePrecision('points'), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [index('schedule_points_leaders_scheduleGameId_idx').on(table.scheduleGameId)]);

const stats = {
  minutes: text('minutes'), fgMade: integer('fgMade'), fgAttempted: integer('fgAttempted'), fgPct: doublePrecision('fgPct'), fg3Made: integer('fg3Made'), fg3Attempted: integer('fg3Attempted'), fg3Pct: doublePrecision('fg3Pct'), ftMade: integer('ftMade'), ftAttempted: integer('ftAttempted'), ftPct: doublePrecision('ftPct'), oreb: integer('oreb'), dreb: integer('dreb'), reb: integer('reb'), ast: integer('ast'), stl: integer('stl'), blk: integer('blk'), tov: integer('tov'), pf: integer('pf'), pts: integer('pts'), plusMinus: doublePrecision('plusMinus'),
};

export const scheduleBoxscoreSummaries = pgTable('schedule_boxscore_summaries', {
  id: id(), scheduleGameId: text('scheduleGameId').notNull().unique().references(() => scheduleGames.id), gameCode: text('gameCode').notNull(), gameStatus: integer('gameStatus').notNull(), gameStatusText: text('gameStatusText').notNull(), period: integer('period').notNull(), gameClock: text('gameClock'), gameTimeUTC: timestamp('gameTimeUTC', { precision: 3 }), gameEt: timestamp('gameEt', { precision: 3 }), duration: text('duration'), attendance: integer('attendance'), sellout: integer('sellout'), seriesGameNumber: text('seriesGameNumber'), gameLabel: text('gameLabel'), gameSubLabel: text('gameSubLabel'), seriesText: text('seriesText'), ifNecessary: boolean('ifNecessary').notNull(), isNeutral: boolean('isNeutral').notNull(),
  arenaId: integer('arenaId'), arenaName: text('arenaName'), arenaCity: text('arenaCity'), arenaState: text('arenaState'), arenaCountry: text('arenaCountry'), arenaTimezone: text('arenaTimezone'), arenaStreet: text('arenaStreet'), arenaPostalCode: text('arenaPostalCode'), homeTeamId: integer('homeTeamId').notNull(), homeScore: integer('homeScore'), homeInBonus: text('homeInBonus'), homeTimeouts: integer('homeTimeouts'), homeSeed: integer('homeSeed'), homePeriods: jsonb('homePeriods'), homePlayers: jsonb('homePlayers'), homeInactives: jsonb('homeInactives'), awayTeamId: integer('awayTeamId').notNull(), awayTeamName: text('awayTeamName'), awayTeamCity: text('awayTeamCity'), awayTeamTricode: text('awayTeamTricode'), awayTeamSlug: text('awayTeamSlug'), awayTeamWins: integer('awayTeamWins'), awayTeamLosses: integer('awayTeamLosses'), awayScore: integer('awayScore'), awayInBonus: text('awayInBonus'), awayTimeouts: integer('awayTimeouts'), awaySeed: integer('awaySeed'), awayStatistics: jsonb('awayStatistics'), awayPeriods: jsonb('awayPeriods'), awayPlayers: jsonb('awayPlayers'), awayInactives: jsonb('awayInactives'), lastFiveMeetings: jsonb('lastFiveMeetings'), pregameCharts: jsonb('pregameCharts'), postgameCharts: jsonb('postgameCharts'), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const scheduleBoxscoreTeams = pgTable('schedule_boxscore_teams', {
  id: id(), scheduleGameId: text('scheduleGameId').notNull().references(() => scheduleGames.id), teamExternalId: integer('teamExternalId').notNull(), side: scheduleTeamSide('side').notNull(), ...stats, createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique('schedule_boxscore_teams_scheduleGameId_side_key').on(table.scheduleGameId, table.side), index('schedule_boxscore_teams_scheduleGameId_idx').on(table.scheduleGameId), index('schedule_boxscore_teams_teamExternalId_idx').on(table.teamExternalId)]);

export const scheduleBoxscorePlayers = pgTable('schedule_boxscore_players', {
  id: id(), scheduleGameId: text('scheduleGameId').notNull().references(() => scheduleGames.id), playerId: text('playerId').notNull().references(() => players.id), playerExternalId: text('playerExternalId').notNull(), teamExternalId: integer('teamExternalId').notNull(), ...stats, createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique('schedule_boxscore_players_scheduleGameId_playerExternalId_key').on(table.scheduleGameId, table.playerExternalId), index('schedule_boxscore_players_scheduleGameId_idx').on(table.scheduleGameId), index('schedule_boxscore_players_playerId_idx').on(table.playerId), index('schedule_boxscore_players_playerExternalId_idx').on(table.playerExternalId)]);

export const categories = pgTable('categories', { id: id(), userId: text('user_id').notNull().references(() => users.id), name: text('name').notNull(), type: categoryType('type').notNull(), colorHex: text('color_hex').notNull(), icon: text('icon').notNull(), createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { precision: 3 }) }, (table) => [index('categories_user_id_type_idx').on(table.userId, table.type), index('categories_user_id_name_idx').on(table.userId, table.name), index('categories_user_id_deleted_at_idx').on(table.userId, table.deletedAt)]);
export const wallets = pgTable('wallets', { id: id(), userId: text('user_id').notNull().references(() => users.id), name: text('name').notNull(), createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { precision: 3 }) });
const finance = (name: 'expenses' | 'incomes') => pgTable(name, { id: id(), userId: text('user_id').notNull().references(() => users.id), walletId: text('wallet_id').notNull().references(() => wallets.id), categoryId: text('category_id').notNull().references(() => categories.id), amount: integer('amount').notNull(), note: text('note'), occurredAt: timestamp('occurred_at', { precision: 3 }).notNull(), createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { precision: 3 }) }, (table) => [index(`${name}_user_id_occurred_at_idx`).on(table.userId, table.occurredAt), index(`${name}_user_id_category_id_idx`).on(table.userId, table.categoryId)]);
export const expenses = finance('expenses');
export const incomes = finance('incomes');
