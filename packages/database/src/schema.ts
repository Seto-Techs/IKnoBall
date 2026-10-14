import { randomUUID } from 'node:crypto';
import { user } from './better-auth.schema.js';

export { account, session, user, verification } from './better-auth.schema.js';
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
export const predictionMode = pgEnum('PredictionMode', ['flat', 'weighted']);
export const predictionStatus = pgEnum('PredictionStatus', ['pending', 'settled', 'voided']);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: text('activity_log_id').primaryKey().$defaultFn(randomUUID),
    userId: text('user_id'),
    category: text('category').notNull(),
    activityName: text('activity_name').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    isSuccess: boolean('is_success').notNull(),
    description: text('description'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index('activity_logs_entity_type_entity_id_idx').on(table.entityType, table.entityId),
    index('activity_logs_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const players = pgTable('players', {
  id: id(),
  externalId: text('externalId').notNull().unique(),
  firstName: text('firstName').notNull(),
  lastName: text('lastName').notNull(),
  displayName: text('displayName'),
  slug: text('slug'),
  position: text('position'),
  teamId: integer('teamId'),
  teamSlug: text('teamSlug'),
  isDefunct: boolean('isDefunct'),
  teamCity: text('teamCity'),
  teamName: text('teamName'),
  teamAbbr: text('teamAbbr'),
  jersey: text('jersey'),
  height: text('height'),
  weight: text('weight'),
  college: text('college'),
  country: text('country'),
  draftYear: integer('draftYear'),
  draftRound: integer('draftRound'),
  draftPick: integer('draftPick'),
  rosterStatus: doublePrecision('rosterStatus'),
  careerFrom: text('careerFrom'),
  careerTo: text('careerTo'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teams = pgTable('teams', {
  id: id(),
  externalId: text('externalId').notNull().unique(),
  name: text('name').notNull(),
  fullName: text('fullName').notNull(),
  abbreviation: text('abbreviation').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  city: text('city').notNull(),
  conference: text('conference').notNull(),
  division: text('division').notNull(),
  logoUrl: text('logoUrl'),
  arena: text('arena'),
  headCoach: text('headCoach'),
  primaryColor: text('primaryColor'),
});

export const playerSeasonStats = pgTable(
  'player_season_stats',
  {
    id: id(),
    playerId: text('playerId')
      .notNull()
      .references(() => players.id),
    season: text('season').notNull(),
    gp: integer('gp'),
    wins: integer('wins'),
    losses: integer('losses'),
    fgPct: doublePrecision('fgPct'),
    fg3Pct: doublePrecision('fg3Pct'),
    ftPct: doublePrecision('ftPct'),
    ptsTotal: doublePrecision('ptsTotal'),
    rebTotal: doublePrecision('rebTotal'),
    astTotal: doublePrecision('astTotal'),
    ptsPerGame: doublePrecision('ptsPerGame'),
    rebPerGame: doublePrecision('rebPerGame'),
    astPerGame: doublePrecision('astPerGame'),
    stlTotal: doublePrecision('stlTotal'),
    blkTotal: doublePrecision('blkTotal'),
    stlPerGame: doublePrecision('stlPerGame'),
    blkPerGame: doublePrecision('blkPerGame'),
    statsTimeframe: text('statsTimeframe'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('player_season_stats_playerId_season_statsTimeframe_key').on(
      table.playerId,
      table.season,
      table.statsTimeframe,
    ),
    index('player_season_stats_playerId_idx').on(table.playerId),
  ],
);

/**
 * The per-team split of a season for a player who was on more than one team.
 *
 * `player_season_stats` keeps one combined row per player/season, which is what
 * every leaderboard query reads. NBA's ByYear dashboard also reports one row per
 * team for a player who moved mid-season; those splits live here so a career row
 * can be opened up. A season the player spent on a single team has no rows here.
 */
export const playerSeasonTeamStats = pgTable(
  'player_season_team_stats',
  {
    id: id(),
    playerId: text('playerId')
      .notNull()
      .references(() => players.id),
    season: text('season').notNull(),
    statsTimeframe: text('statsTimeframe').notNull(),
    /** The feed's own abbreviation for this split (BKN, not the teams table's). */
    teamAbbr: text('teamAbbr').notNull(),
    gp: integer('gp'),
    wins: integer('wins'),
    losses: integer('losses'),
    fgPct: doublePrecision('fgPct'),
    fg3Pct: doublePrecision('fg3Pct'),
    ftPct: doublePrecision('ftPct'),
    ptsTotal: doublePrecision('ptsTotal'),
    rebTotal: doublePrecision('rebTotal'),
    astTotal: doublePrecision('astTotal'),
    ptsPerGame: doublePrecision('ptsPerGame'),
    rebPerGame: doublePrecision('rebPerGame'),
    astPerGame: doublePrecision('astPerGame'),
    stlTotal: doublePrecision('stlTotal'),
    blkTotal: doublePrecision('blkTotal'),
    stlPerGame: doublePrecision('stlPerGame'),
    blkPerGame: doublePrecision('blkPerGame'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('player_season_team_stats_playerId_season_timeframe_team_key').on(
      table.playerId,
      table.season,
      table.statsTimeframe,
      table.teamAbbr,
    ),
    index('player_season_team_stats_playerId_idx').on(table.playerId),
  ],
);

export const scheduleDays = pgTable(
  'schedule_days',
  {
    id: id(),
    gameDate: date('gameDate', { mode: 'string' }).notNull(),
    seasonYear: text('seasonYear').notNull(),
    leagueId: text('leagueId').notNull(),
    metaVersion: integer('metaVersion').notNull(),
    metaRequest: text('metaRequest').notNull(),
    metaTime: timestamp('metaTime', { precision: 3 }).notNull(),
    hash: text('hash').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('schedule_days_gameDate_seasonYear_leagueId_key').on(
      table.gameDate,
      table.seasonYear,
      table.leagueId,
    ),
    index('schedule_days_gameDate_idx').on(table.gameDate),
  ],
);

export const scheduleGames = pgTable(
  'schedule_games',
  {
    id: id(),
    scheduleDayId: text('scheduleDayId')
      .notNull()
      .references(() => scheduleDays.id),
    gameId: text('gameId').notNull().unique(),
    gameDate: date('gameDate', { mode: 'string' }).notNull(),
    gameCode: text('gameCode').notNull(),
    gameStatus: integer('gameStatus').notNull(),
    gameStatusText: text('gameStatusText').notNull(),
    gameSequence: integer('gameSequence').notNull(),
    gameDateEst: timestamp('gameDateEst', { precision: 3 }),
    gameTimeEst: timestamp('gameTimeEst', { precision: 3 }),
    gameDateTimeEst: timestamp('gameDateTimeEst', { precision: 3 }),
    gameDateUTC: timestamp('gameDateUTC', { precision: 3 }),
    gameTimeUTC: timestamp('gameTimeUTC', { precision: 3 }),
    gameDateTimeUTC: timestamp('gameDateTimeUTC', { precision: 3 }),
    awayTeamTime: timestamp('awayTeamTime', { precision: 3 }),
    homeTeamTime: timestamp('homeTeamTime', { precision: 3 }),
    day: text('day'),
    monthNum: integer('monthNum'),
    weekNumber: integer('weekNumber'),
    weekName: text('weekName'),
    ifNecessary: text('ifNecessary'),
    seriesGameNumber: text('seriesGameNumber'),
    gameLabel: text('gameLabel'),
    gameSubLabel: text('gameSubLabel'),
    seriesText: text('seriesText'),
    arenaName: text('arenaName'),
    arenaState: text('arenaState'),
    arenaCity: text('arenaCity'),
    postponedStatus: text('postponedStatus'),
    branchLink: text('branchLink'),
    gameSubtype: text('gameSubtype'),
    isNeutral: boolean('isNeutral').notNull(),
    homeTeamId: integer('homeTeamId'),
    homeTeamName: text('homeTeamName'),
    homeTeamCity: text('homeTeamCity'),
    homeTeamTricode: text('homeTeamTricode'),
    homeTeamSlug: text('homeTeamSlug'),
    homeTeamWins: integer('homeTeamWins'),
    homeTeamLosses: integer('homeTeamLosses'),
    homeTeamScore: integer('homeTeamScore'),
    homeTeamSeed: integer('homeTeamSeed'),
    awayTeamId: integer('awayTeamId'),
    awayTeamName: text('awayTeamName'),
    awayTeamCity: text('awayTeamCity'),
    awayTeamTricode: text('awayTeamTricode'),
    awayTeamSlug: text('awayTeamSlug'),
    awayTeamWins: integer('awayTeamWins'),
    awayTeamLosses: integer('awayTeamLosses'),
    awayTeamScore: integer('awayTeamScore'),
    awayTeamSeed: integer('awayTeamSeed'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('schedule_games_gameDate_idx').on(table.gameDate),
    index('schedule_games_scheduleDayId_idx').on(table.scheduleDayId),
  ],
);

/**
 * Per-zone shooting tallies for one player in one game.
 *
 * Stored per game rather than per season because the sync runs per game: a game
 * going final is what triggers it, so the game is the natural unit and the
 * primary key makes the write idempotent. A season's totals are a `sum` over
 * these rows, which keeps one source of truth instead of a rollup that can drift
 * from the games it was built from.
 *
 * The play-by-play that produces these is fetched and thrown away: a whole
 * league season is ~520 MB of JSON to download and a few MB of tallies to keep,
 * so there is nothing to gain by persisting every shot.
 *
 * `zoneId` is one of the ids in `@iknoball/shot-zones`. Storing the id rather
 * than an index means a zone can be renamed or a chart restyled without a
 * migration, and every game can be re-synced from the same play-by-play if a
 * boundary moves — which is why the raw shots are not kept.
 */
export const playerGameShotZones = pgTable(
  'player_game_shot_zones',
  {
    id: id(),
    scheduleGameId: text('scheduleGameId')
      .notNull()
      .references(() => scheduleGames.id),
    playerId: text('playerId')
      .notNull()
      .references(() => players.id),
    /** Denormalised from the game's schedule day so a season read needs no join. */
    season: text('season').notNull(),
    /** Matches the season types the other player tables use. */
    statsTimeframe: text('statsTimeframe').notNull(),
    zoneId: text('zoneId').notNull(),
    fga: integer('fga').notNull(),
    fgm: integer('fgm').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('player_game_shot_zones_game_player_zone_key').on(
      table.scheduleGameId,
      table.playerId,
      table.zoneId,
    ),
    index('player_game_shot_zones_player_season_idx').on(
      table.playerId,
      table.season,
      table.statsTimeframe,
    ),
  ],
);

/**
 * One row per game whose play-by-play has been classified.
 *
 * This is what makes the sync safe to re-run: a game with a row here is skipped,
 * so a cron tick overlapping a manual backfill, or a retry after a crash, cannot
 * double-count a game. It is also how the sync finds its work — final games with
 * no row are the ones still to do — which means a game that finished while the
 * worker was down is picked up on the next tick rather than lost.
 *
 * The counts are recorded so a game that synced to something implausible is
 * visible without re-fetching it.
 */
export const shotZoneGameSyncs = pgTable(
  'shot_zone_game_syncs',
  {
    id: id(),
    scheduleGameId: text('scheduleGameId')
      .notNull()
      .unique()
      .references(() => scheduleGames.id),
    /** Field-goal attempts the feed carried for this game. */
    attemptCount: integer('attemptCount').notNull(),
    /** Players those attempts were attributed to. */
    playerCount: integer('playerCount').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('shot_zone_game_syncs_scheduleGameId_idx').on(table.scheduleGameId)],
);

export const schedulePointsLeaders = pgTable(
  'schedule_points_leaders',
  {
    id: id(),
    scheduleGameId: text('scheduleGameId')
      .notNull()
      .references(() => scheduleGames.id),
    personId: integer('personId'),
    firstName: text('firstName'),
    lastName: text('lastName'),
    teamId: integer('teamId'),
    teamCity: text('teamCity'),
    teamName: text('teamName'),
    teamTricode: text('teamTricode'),
    points: doublePrecision('points'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('schedule_points_leaders_scheduleGameId_idx').on(table.scheduleGameId)],
);

const stats = {
  minutes: text('minutes'),
  fgMade: integer('fgMade'),
  fgAttempted: integer('fgAttempted'),
  fgPct: doublePrecision('fgPct'),
  fg3Made: integer('fg3Made'),
  fg3Attempted: integer('fg3Attempted'),
  fg3Pct: doublePrecision('fg3Pct'),
  ftMade: integer('ftMade'),
  ftAttempted: integer('ftAttempted'),
  ftPct: doublePrecision('ftPct'),
  oreb: integer('oreb'),
  dreb: integer('dreb'),
  reb: integer('reb'),
  ast: integer('ast'),
  stl: integer('stl'),
  blk: integer('blk'),
  tov: integer('tov'),
  pf: integer('pf'),
  pts: integer('pts'),
  plusMinus: doublePrecision('plusMinus'),
};

export const scheduleBoxscoreSummaries = pgTable('schedule_boxscore_summaries', {
  id: id(),
  scheduleGameId: text('scheduleGameId')
    .notNull()
    .unique()
    .references(() => scheduleGames.id),
  gameCode: text('gameCode').notNull(),
  gameStatus: integer('gameStatus').notNull(),
  gameStatusText: text('gameStatusText').notNull(),
  period: integer('period').notNull(),
  gameClock: text('gameClock'),
  gameTimeUTC: timestamp('gameTimeUTC', { precision: 3 }),
  gameEt: timestamp('gameEt', { precision: 3 }),
  duration: text('duration'),
  attendance: integer('attendance'),
  sellout: integer('sellout'),
  seriesGameNumber: text('seriesGameNumber'),
  gameLabel: text('gameLabel'),
  gameSubLabel: text('gameSubLabel'),
  seriesText: text('seriesText'),
  ifNecessary: boolean('ifNecessary').notNull(),
  isNeutral: boolean('isNeutral').notNull(),
  arenaId: integer('arenaId'),
  arenaName: text('arenaName'),
  arenaCity: text('arenaCity'),
  arenaState: text('arenaState'),
  arenaCountry: text('arenaCountry'),
  arenaTimezone: text('arenaTimezone'),
  arenaStreet: text('arenaStreet'),
  arenaPostalCode: text('arenaPostalCode'),
  homeTeamId: integer('homeTeamId').notNull(),
  homeScore: integer('homeScore'),
  homeInBonus: text('homeInBonus'),
  homeTimeouts: integer('homeTimeouts'),
  homeSeed: integer('homeSeed'),
  homePeriods: jsonb('homePeriods'),
  homePlayers: jsonb('homePlayers'),
  homeInactives: jsonb('homeInactives'),
  awayTeamId: integer('awayTeamId').notNull(),
  awayTeamName: text('awayTeamName'),
  awayTeamCity: text('awayTeamCity'),
  awayTeamTricode: text('awayTeamTricode'),
  awayTeamSlug: text('awayTeamSlug'),
  awayTeamWins: integer('awayTeamWins'),
  awayTeamLosses: integer('awayTeamLosses'),
  awayScore: integer('awayScore'),
  awayInBonus: text('awayInBonus'),
  awayTimeouts: integer('awayTimeouts'),
  awaySeed: integer('awaySeed'),
  awayStatistics: jsonb('awayStatistics'),
  awayPeriods: jsonb('awayPeriods'),
  awayPlayers: jsonb('awayPlayers'),
  awayInactives: jsonb('awayInactives'),
  lastFiveMeetings: jsonb('lastFiveMeetings'),
  pregameCharts: jsonb('pregameCharts'),
  postgameCharts: jsonb('postgameCharts'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scheduleBoxscoreTeams = pgTable(
  'schedule_boxscore_teams',
  {
    id: id(),
    scheduleGameId: text('scheduleGameId')
      .notNull()
      .references(() => scheduleGames.id),
    teamExternalId: integer('teamExternalId').notNull(),
    side: scheduleTeamSide('side').notNull(),
    ...stats,
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('schedule_boxscore_teams_scheduleGameId_side_key').on(table.scheduleGameId, table.side),
    index('schedule_boxscore_teams_scheduleGameId_idx').on(table.scheduleGameId),
    index('schedule_boxscore_teams_teamExternalId_idx').on(table.teamExternalId),
  ],
);

export const scheduleBoxscorePlayers = pgTable(
  'schedule_boxscore_players',
  {
    id: id(),
    scheduleGameId: text('scheduleGameId')
      .notNull()
      .references(() => scheduleGames.id),
    playerId: text('playerId')
      .notNull()
      .references(() => players.id),
    playerExternalId: text('playerExternalId').notNull(),
    teamExternalId: integer('teamExternalId').notNull(),
    /** True when the feed lists this player in the starting five. */
    starter: boolean('starter'),
    /**
     * The feed's box-score display order (starters first, then the bench). Kept
     * so a live box score can list players in the order the feed presents them,
     * which ordering by any stat would lose.
     */
    displayOrder: integer('displayOrder'),
    ...stats,
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('schedule_boxscore_players_scheduleGameId_playerExternalId_key').on(
      table.scheduleGameId,
      table.playerExternalId,
    ),
    index('schedule_boxscore_players_scheduleGameId_idx').on(table.scheduleGameId),
    index('schedule_boxscore_players_playerId_idx').on(table.playerId),
    index('schedule_boxscore_players_playerExternalId_idx').on(table.playerExternalId),
  ],
);

/**
 * Append-only odds capture, one row per game/book/capture.
 *
 * The NBA CDN odds file only exposes current state, so every fetch is persisted
 * here to provide the audit trail needed to justify a locked payout.
 */
export const gameOddsSnapshots = pgTable(
  'game_odds_snapshots',
  {
    id: id(),
    gameId: text('gameId').notNull(),
    bookName: text('bookName').notNull(),
    bookCountry: text('bookCountry').notNull(),
    homeDecimal: doublePrecision('homeDecimal').notNull(),
    awayDecimal: doublePrecision('awayDecimal').notNull(),
    homeOpeningDecimal: doublePrecision('homeOpeningDecimal'),
    awayOpeningDecimal: doublePrecision('awayOpeningDecimal'),
    capturedAt: timestamp('capturedAt', { precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    unique('game_odds_snapshots_gameId_book_capturedAt_key').on(
      table.gameId,
      table.bookName,
      table.bookCountry,
      table.capturedAt,
    ),
    index('game_odds_snapshots_gameId_capturedAt_idx').on(table.gameId, table.capturedAt),
  ],
);

/**
 * A user's pick on a game, one row per mode.
 *
 * `gameId` is intentionally not a foreign key: the schedule sync hard-deletes
 * non-final games that drop out of a day's feed, and a constraint here would
 * either block that delete or cascade the pick away. Keeping it as plain text
 * lets the pick survive as a voided record.
 *
 * `lockedDecimal` is the de-vigged price captured at submit. Settlement reads
 * only this column, never live odds.
 */
export const predictionPicks = pgTable(
  'prediction_picks',
  {
    id: id(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('gameId').notNull(),
    mode: predictionMode('mode').notNull(),
    side: scheduleTeamSide('side').notNull(),
    lockedDecimal: doublePrecision('lockedDecimal'),
    lockedBook: text('lockedBook'),
    lockedAt: timestamp('lockedAt', { precision: 3 }),
    points: integer('points'),
    status: predictionStatus('status').notNull().default('pending'),
    settledAt: timestamp('settledAt', { precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('prediction_picks_userId_gameId_mode_key').on(table.userId, table.gameId, table.mode),
    index('prediction_picks_userId_settledAt_idx').on(table.userId, table.settledAt),
    index('prediction_picks_gameId_idx').on(table.gameId),
    index('prediction_picks_status_idx').on(table.status),
  ],
);
