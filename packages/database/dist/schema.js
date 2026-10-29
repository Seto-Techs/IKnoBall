"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discordMembers = exports.discordGuilds = exports.discordLinks = exports.discordCards = exports.predictionPicks = exports.gameOddsSnapshots = exports.scheduleBoxscorePlayers = exports.scheduleBoxscoreTeams = exports.scheduleBoxscoreSummaries = exports.schedulePointsLeaders = exports.shotZoneGameSyncs = exports.playerGameShotZones = exports.scheduleGames = exports.scheduleDays = exports.playerSeasonTeamStats = exports.playerSeasonStats = exports.teams = exports.players = exports.activityLogs = exports.predictionSource = exports.predictionStatus = exports.predictionMode = exports.categoryType = exports.scheduleTeamSide = exports.verification = exports.user = exports.session = exports.account = void 0;
const node_crypto_1 = require("node:crypto");
const better_auth_schema_js_1 = require("./better-auth.schema.js");
var better_auth_schema_js_2 = require("./better-auth.schema.js");
Object.defineProperty(exports, "account", { enumerable: true, get: function () { return better_auth_schema_js_2.account; } });
Object.defineProperty(exports, "session", { enumerable: true, get: function () { return better_auth_schema_js_2.session; } });
Object.defineProperty(exports, "user", { enumerable: true, get: function () { return better_auth_schema_js_2.user; } });
Object.defineProperty(exports, "verification", { enumerable: true, get: function () { return better_auth_schema_js_2.verification; } });
const pg_core_1 = require("drizzle-orm/pg-core");
const id = () => (0, pg_core_1.text)('id').primaryKey().$defaultFn(node_crypto_1.randomUUID);
const createdAt = () => (0, pg_core_1.timestamp)('createdAt', { precision: 3 }).notNull().defaultNow();
const updatedAt = () => (0, pg_core_1.timestamp)('updatedAt', { precision: 3 }).notNull().defaultNow();
exports.scheduleTeamSide = (0, pg_core_1.pgEnum)('ScheduleTeamSide', ['home', 'away']);
exports.categoryType = (0, pg_core_1.pgEnum)('CategoryType', ['income', 'expense']);
exports.predictionMode = (0, pg_core_1.pgEnum)('PredictionMode', ['flat', 'weighted']);
exports.predictionStatus = (0, pg_core_1.pgEnum)('PredictionStatus', ['pending', 'settled', 'voided']);
exports.predictionSource = (0, pg_core_1.pgEnum)('PredictionSource', ['web', 'discord']);
exports.activityLogs = (0, pg_core_1.pgTable)('activity_logs', {
    id: (0, pg_core_1.text)('activity_log_id').primaryKey().$defaultFn(node_crypto_1.randomUUID),
    userId: (0, pg_core_1.text)('user_id'),
    category: (0, pg_core_1.text)('category').notNull(),
    activityName: (0, pg_core_1.text)('activity_name').notNull(),
    entityType: (0, pg_core_1.text)('entity_type').notNull(),
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    isSuccess: (0, pg_core_1.boolean)('is_success').notNull(),
    description: (0, pg_core_1.text)('description'),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { precision: 3 }).notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('activity_logs_entity_type_entity_id_idx').on(table.entityType, table.entityId),
    (0, pg_core_1.index)('activity_logs_user_id_created_at_idx').on(table.userId, table.createdAt),
]);
exports.players = (0, pg_core_1.pgTable)('players', {
    id: id(),
    externalId: (0, pg_core_1.text)('externalId').notNull().unique(),
    firstName: (0, pg_core_1.text)('firstName').notNull(),
    lastName: (0, pg_core_1.text)('lastName').notNull(),
    displayName: (0, pg_core_1.text)('displayName'),
    slug: (0, pg_core_1.text)('slug'),
    position: (0, pg_core_1.text)('position'),
    teamId: (0, pg_core_1.integer)('teamId'),
    teamSlug: (0, pg_core_1.text)('teamSlug'),
    isDefunct: (0, pg_core_1.boolean)('isDefunct'),
    teamCity: (0, pg_core_1.text)('teamCity'),
    teamName: (0, pg_core_1.text)('teamName'),
    teamAbbr: (0, pg_core_1.text)('teamAbbr'),
    jersey: (0, pg_core_1.text)('jersey'),
    height: (0, pg_core_1.text)('height'),
    weight: (0, pg_core_1.text)('weight'),
    college: (0, pg_core_1.text)('college'),
    country: (0, pg_core_1.text)('country'),
    draftYear: (0, pg_core_1.integer)('draftYear'),
    draftRound: (0, pg_core_1.integer)('draftRound'),
    draftPick: (0, pg_core_1.integer)('draftPick'),
    rosterStatus: (0, pg_core_1.doublePrecision)('rosterStatus'),
    careerFrom: (0, pg_core_1.text)('careerFrom'),
    careerTo: (0, pg_core_1.text)('careerTo'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});
exports.teams = (0, pg_core_1.pgTable)('teams', {
    id: id(),
    externalId: (0, pg_core_1.text)('externalId').notNull().unique(),
    name: (0, pg_core_1.text)('name').notNull(),
    fullName: (0, pg_core_1.text)('fullName').notNull(),
    abbreviation: (0, pg_core_1.text)('abbreviation').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    city: (0, pg_core_1.text)('city').notNull(),
    conference: (0, pg_core_1.text)('conference').notNull(),
    division: (0, pg_core_1.text)('division').notNull(),
    logoUrl: (0, pg_core_1.text)('logoUrl'),
    arena: (0, pg_core_1.text)('arena'),
    headCoach: (0, pg_core_1.text)('headCoach'),
    primaryColor: (0, pg_core_1.text)('primaryColor'),
});
exports.playerSeasonStats = (0, pg_core_1.pgTable)('player_season_stats', {
    id: id(),
    playerId: (0, pg_core_1.text)('playerId')
        .notNull()
        .references(() => exports.players.id),
    season: (0, pg_core_1.text)('season').notNull(),
    gp: (0, pg_core_1.integer)('gp'),
    wins: (0, pg_core_1.integer)('wins'),
    losses: (0, pg_core_1.integer)('losses'),
    fgPct: (0, pg_core_1.doublePrecision)('fgPct'),
    fg3Pct: (0, pg_core_1.doublePrecision)('fg3Pct'),
    ftPct: (0, pg_core_1.doublePrecision)('ftPct'),
    ptsTotal: (0, pg_core_1.doublePrecision)('ptsTotal'),
    rebTotal: (0, pg_core_1.doublePrecision)('rebTotal'),
    astTotal: (0, pg_core_1.doublePrecision)('astTotal'),
    ptsPerGame: (0, pg_core_1.doublePrecision)('ptsPerGame'),
    rebPerGame: (0, pg_core_1.doublePrecision)('rebPerGame'),
    astPerGame: (0, pg_core_1.doublePrecision)('astPerGame'),
    stlTotal: (0, pg_core_1.doublePrecision)('stlTotal'),
    blkTotal: (0, pg_core_1.doublePrecision)('blkTotal'),
    stlPerGame: (0, pg_core_1.doublePrecision)('stlPerGame'),
    blkPerGame: (0, pg_core_1.doublePrecision)('blkPerGame'),
    statsTimeframe: (0, pg_core_1.text)('statsTimeframe'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('player_season_stats_playerId_season_statsTimeframe_key').on(table.playerId, table.season, table.statsTimeframe),
    (0, pg_core_1.index)('player_season_stats_playerId_idx').on(table.playerId),
]);
/**
 * The per-team split of a season for a player who was on more than one team.
 *
 * `player_season_stats` keeps one combined row per player/season, which is what
 * every leaderboard query reads. NBA's ByYear dashboard also reports one row per
 * team for a player who moved mid-season; those splits live here so a career row
 * can be opened up. A season the player spent on a single team has no rows here.
 */
exports.playerSeasonTeamStats = (0, pg_core_1.pgTable)('player_season_team_stats', {
    id: id(),
    playerId: (0, pg_core_1.text)('playerId')
        .notNull()
        .references(() => exports.players.id),
    season: (0, pg_core_1.text)('season').notNull(),
    statsTimeframe: (0, pg_core_1.text)('statsTimeframe').notNull(),
    /** The feed's own abbreviation for this split (BKN, not the teams table's). */
    teamAbbr: (0, pg_core_1.text)('teamAbbr').notNull(),
    gp: (0, pg_core_1.integer)('gp'),
    wins: (0, pg_core_1.integer)('wins'),
    losses: (0, pg_core_1.integer)('losses'),
    fgPct: (0, pg_core_1.doublePrecision)('fgPct'),
    fg3Pct: (0, pg_core_1.doublePrecision)('fg3Pct'),
    ftPct: (0, pg_core_1.doublePrecision)('ftPct'),
    ptsTotal: (0, pg_core_1.doublePrecision)('ptsTotal'),
    rebTotal: (0, pg_core_1.doublePrecision)('rebTotal'),
    astTotal: (0, pg_core_1.doublePrecision)('astTotal'),
    ptsPerGame: (0, pg_core_1.doublePrecision)('ptsPerGame'),
    rebPerGame: (0, pg_core_1.doublePrecision)('rebPerGame'),
    astPerGame: (0, pg_core_1.doublePrecision)('astPerGame'),
    stlTotal: (0, pg_core_1.doublePrecision)('stlTotal'),
    blkTotal: (0, pg_core_1.doublePrecision)('blkTotal'),
    stlPerGame: (0, pg_core_1.doublePrecision)('stlPerGame'),
    blkPerGame: (0, pg_core_1.doublePrecision)('blkPerGame'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('player_season_team_stats_playerId_season_timeframe_team_key').on(table.playerId, table.season, table.statsTimeframe, table.teamAbbr),
    (0, pg_core_1.index)('player_season_team_stats_playerId_idx').on(table.playerId),
]);
exports.scheduleDays = (0, pg_core_1.pgTable)('schedule_days', {
    id: id(),
    gameDate: (0, pg_core_1.date)('gameDate', { mode: 'string' }).notNull(),
    seasonYear: (0, pg_core_1.text)('seasonYear').notNull(),
    leagueId: (0, pg_core_1.text)('leagueId').notNull(),
    metaVersion: (0, pg_core_1.integer)('metaVersion').notNull(),
    metaRequest: (0, pg_core_1.text)('metaRequest').notNull(),
    metaTime: (0, pg_core_1.timestamp)('metaTime', { precision: 3 }).notNull(),
    hash: (0, pg_core_1.text)('hash').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('schedule_days_gameDate_seasonYear_leagueId_key').on(table.gameDate, table.seasonYear, table.leagueId),
    (0, pg_core_1.index)('schedule_days_gameDate_idx').on(table.gameDate),
]);
exports.scheduleGames = (0, pg_core_1.pgTable)('schedule_games', {
    id: id(),
    scheduleDayId: (0, pg_core_1.text)('scheduleDayId')
        .notNull()
        .references(() => exports.scheduleDays.id),
    gameId: (0, pg_core_1.text)('gameId').notNull().unique(),
    gameDate: (0, pg_core_1.date)('gameDate', { mode: 'string' }).notNull(),
    gameCode: (0, pg_core_1.text)('gameCode').notNull(),
    gameStatus: (0, pg_core_1.integer)('gameStatus').notNull(),
    gameStatusText: (0, pg_core_1.text)('gameStatusText').notNull(),
    gameSequence: (0, pg_core_1.integer)('gameSequence').notNull(),
    gameDateEst: (0, pg_core_1.timestamp)('gameDateEst', { precision: 3 }),
    gameTimeEst: (0, pg_core_1.timestamp)('gameTimeEst', { precision: 3 }),
    gameDateTimeEst: (0, pg_core_1.timestamp)('gameDateTimeEst', { precision: 3 }),
    gameDateUTC: (0, pg_core_1.timestamp)('gameDateUTC', { precision: 3 }),
    gameTimeUTC: (0, pg_core_1.timestamp)('gameTimeUTC', { precision: 3 }),
    gameDateTimeUTC: (0, pg_core_1.timestamp)('gameDateTimeUTC', { precision: 3 }),
    awayTeamTime: (0, pg_core_1.timestamp)('awayTeamTime', { precision: 3 }),
    homeTeamTime: (0, pg_core_1.timestamp)('homeTeamTime', { precision: 3 }),
    day: (0, pg_core_1.text)('day'),
    monthNum: (0, pg_core_1.integer)('monthNum'),
    weekNumber: (0, pg_core_1.integer)('weekNumber'),
    weekName: (0, pg_core_1.text)('weekName'),
    ifNecessary: (0, pg_core_1.text)('ifNecessary'),
    seriesGameNumber: (0, pg_core_1.text)('seriesGameNumber'),
    gameLabel: (0, pg_core_1.text)('gameLabel'),
    gameSubLabel: (0, pg_core_1.text)('gameSubLabel'),
    seriesText: (0, pg_core_1.text)('seriesText'),
    arenaName: (0, pg_core_1.text)('arenaName'),
    arenaState: (0, pg_core_1.text)('arenaState'),
    arenaCity: (0, pg_core_1.text)('arenaCity'),
    postponedStatus: (0, pg_core_1.text)('postponedStatus'),
    branchLink: (0, pg_core_1.text)('branchLink'),
    gameSubtype: (0, pg_core_1.text)('gameSubtype'),
    isNeutral: (0, pg_core_1.boolean)('isNeutral').notNull(),
    homeTeamId: (0, pg_core_1.integer)('homeTeamId'),
    homeTeamName: (0, pg_core_1.text)('homeTeamName'),
    homeTeamCity: (0, pg_core_1.text)('homeTeamCity'),
    homeTeamTricode: (0, pg_core_1.text)('homeTeamTricode'),
    homeTeamSlug: (0, pg_core_1.text)('homeTeamSlug'),
    homeTeamWins: (0, pg_core_1.integer)('homeTeamWins'),
    homeTeamLosses: (0, pg_core_1.integer)('homeTeamLosses'),
    homeTeamScore: (0, pg_core_1.integer)('homeTeamScore'),
    homeTeamSeed: (0, pg_core_1.integer)('homeTeamSeed'),
    awayTeamId: (0, pg_core_1.integer)('awayTeamId'),
    awayTeamName: (0, pg_core_1.text)('awayTeamName'),
    awayTeamCity: (0, pg_core_1.text)('awayTeamCity'),
    awayTeamTricode: (0, pg_core_1.text)('awayTeamTricode'),
    awayTeamSlug: (0, pg_core_1.text)('awayTeamSlug'),
    awayTeamWins: (0, pg_core_1.integer)('awayTeamWins'),
    awayTeamLosses: (0, pg_core_1.integer)('awayTeamLosses'),
    awayTeamScore: (0, pg_core_1.integer)('awayTeamScore'),
    awayTeamSeed: (0, pg_core_1.integer)('awayTeamSeed'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.index)('schedule_games_gameDate_idx').on(table.gameDate),
    (0, pg_core_1.index)('schedule_games_scheduleDayId_idx').on(table.scheduleDayId),
]);
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
exports.playerGameShotZones = (0, pg_core_1.pgTable)('player_game_shot_zones', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .references(() => exports.scheduleGames.id),
    playerId: (0, pg_core_1.text)('playerId')
        .notNull()
        .references(() => exports.players.id),
    /** Denormalised from the game's schedule day so a season read needs no join. */
    season: (0, pg_core_1.text)('season').notNull(),
    /** Matches the season types the other player tables use. */
    statsTimeframe: (0, pg_core_1.text)('statsTimeframe').notNull(),
    zoneId: (0, pg_core_1.text)('zoneId').notNull(),
    fga: (0, pg_core_1.integer)('fga').notNull(),
    fgm: (0, pg_core_1.integer)('fgm').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('player_game_shot_zones_game_player_zone_key').on(table.scheduleGameId, table.playerId, table.zoneId),
    (0, pg_core_1.index)('player_game_shot_zones_player_season_idx').on(table.playerId, table.season, table.statsTimeframe),
    /**
     * For the league-wide read that produces a season's per-zone baseline, which
     * has no player to filter on and so cannot use the index above. Carrying the
     * tallies makes it a covering index, so a season aggregates from the index
     * alone rather than fetching the whole season's rows from the heap — 450ms
     * and a disk sort becomes tens of milliseconds.
     */
    (0, pg_core_1.index)('player_game_shot_zones_season_zone_idx').on(table.season, table.statsTimeframe, table.zoneId, table.fga, table.fgm),
]);
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
exports.shotZoneGameSyncs = (0, pg_core_1.pgTable)('shot_zone_game_syncs', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .unique()
        .references(() => exports.scheduleGames.id),
    /** Field-goal attempts the feed carried for this game. */
    attemptCount: (0, pg_core_1.integer)('attemptCount').notNull(),
    /** Players those attempts were attributed to. */
    playerCount: (0, pg_core_1.integer)('playerCount').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [(0, pg_core_1.index)('shot_zone_game_syncs_scheduleGameId_idx').on(table.scheduleGameId)]);
exports.schedulePointsLeaders = (0, pg_core_1.pgTable)('schedule_points_leaders', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .references(() => exports.scheduleGames.id),
    personId: (0, pg_core_1.integer)('personId'),
    firstName: (0, pg_core_1.text)('firstName'),
    lastName: (0, pg_core_1.text)('lastName'),
    teamId: (0, pg_core_1.integer)('teamId'),
    teamCity: (0, pg_core_1.text)('teamCity'),
    teamName: (0, pg_core_1.text)('teamName'),
    teamTricode: (0, pg_core_1.text)('teamTricode'),
    points: (0, pg_core_1.doublePrecision)('points'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [(0, pg_core_1.index)('schedule_points_leaders_scheduleGameId_idx').on(table.scheduleGameId)]);
const stats = {
    minutes: (0, pg_core_1.text)('minutes'),
    fgMade: (0, pg_core_1.integer)('fgMade'),
    fgAttempted: (0, pg_core_1.integer)('fgAttempted'),
    fgPct: (0, pg_core_1.doublePrecision)('fgPct'),
    fg3Made: (0, pg_core_1.integer)('fg3Made'),
    fg3Attempted: (0, pg_core_1.integer)('fg3Attempted'),
    fg3Pct: (0, pg_core_1.doublePrecision)('fg3Pct'),
    ftMade: (0, pg_core_1.integer)('ftMade'),
    ftAttempted: (0, pg_core_1.integer)('ftAttempted'),
    ftPct: (0, pg_core_1.doublePrecision)('ftPct'),
    oreb: (0, pg_core_1.integer)('oreb'),
    dreb: (0, pg_core_1.integer)('dreb'),
    reb: (0, pg_core_1.integer)('reb'),
    ast: (0, pg_core_1.integer)('ast'),
    stl: (0, pg_core_1.integer)('stl'),
    blk: (0, pg_core_1.integer)('blk'),
    tov: (0, pg_core_1.integer)('tov'),
    pf: (0, pg_core_1.integer)('pf'),
    pts: (0, pg_core_1.integer)('pts'),
    plusMinus: (0, pg_core_1.doublePrecision)('plusMinus'),
};
exports.scheduleBoxscoreSummaries = (0, pg_core_1.pgTable)('schedule_boxscore_summaries', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .unique()
        .references(() => exports.scheduleGames.id),
    gameCode: (0, pg_core_1.text)('gameCode').notNull(),
    gameStatus: (0, pg_core_1.integer)('gameStatus').notNull(),
    gameStatusText: (0, pg_core_1.text)('gameStatusText').notNull(),
    period: (0, pg_core_1.integer)('period').notNull(),
    gameClock: (0, pg_core_1.text)('gameClock'),
    gameTimeUTC: (0, pg_core_1.timestamp)('gameTimeUTC', { precision: 3 }),
    gameEt: (0, pg_core_1.timestamp)('gameEt', { precision: 3 }),
    duration: (0, pg_core_1.text)('duration'),
    attendance: (0, pg_core_1.integer)('attendance'),
    sellout: (0, pg_core_1.integer)('sellout'),
    seriesGameNumber: (0, pg_core_1.text)('seriesGameNumber'),
    gameLabel: (0, pg_core_1.text)('gameLabel'),
    gameSubLabel: (0, pg_core_1.text)('gameSubLabel'),
    seriesText: (0, pg_core_1.text)('seriesText'),
    ifNecessary: (0, pg_core_1.boolean)('ifNecessary').notNull(),
    isNeutral: (0, pg_core_1.boolean)('isNeutral').notNull(),
    arenaId: (0, pg_core_1.integer)('arenaId'),
    arenaName: (0, pg_core_1.text)('arenaName'),
    arenaCity: (0, pg_core_1.text)('arenaCity'),
    arenaState: (0, pg_core_1.text)('arenaState'),
    arenaCountry: (0, pg_core_1.text)('arenaCountry'),
    arenaTimezone: (0, pg_core_1.text)('arenaTimezone'),
    arenaStreet: (0, pg_core_1.text)('arenaStreet'),
    arenaPostalCode: (0, pg_core_1.text)('arenaPostalCode'),
    homeTeamId: (0, pg_core_1.integer)('homeTeamId').notNull(),
    homeScore: (0, pg_core_1.integer)('homeScore'),
    homeInBonus: (0, pg_core_1.text)('homeInBonus'),
    homeTimeouts: (0, pg_core_1.integer)('homeTimeouts'),
    homeSeed: (0, pg_core_1.integer)('homeSeed'),
    homePeriods: (0, pg_core_1.jsonb)('homePeriods'),
    homePlayers: (0, pg_core_1.jsonb)('homePlayers'),
    homeInactives: (0, pg_core_1.jsonb)('homeInactives'),
    awayTeamId: (0, pg_core_1.integer)('awayTeamId').notNull(),
    awayTeamName: (0, pg_core_1.text)('awayTeamName'),
    awayTeamCity: (0, pg_core_1.text)('awayTeamCity'),
    awayTeamTricode: (0, pg_core_1.text)('awayTeamTricode'),
    awayTeamSlug: (0, pg_core_1.text)('awayTeamSlug'),
    awayTeamWins: (0, pg_core_1.integer)('awayTeamWins'),
    awayTeamLosses: (0, pg_core_1.integer)('awayTeamLosses'),
    awayScore: (0, pg_core_1.integer)('awayScore'),
    awayInBonus: (0, pg_core_1.text)('awayInBonus'),
    awayTimeouts: (0, pg_core_1.integer)('awayTimeouts'),
    awaySeed: (0, pg_core_1.integer)('awaySeed'),
    awayStatistics: (0, pg_core_1.jsonb)('awayStatistics'),
    awayPeriods: (0, pg_core_1.jsonb)('awayPeriods'),
    awayPlayers: (0, pg_core_1.jsonb)('awayPlayers'),
    awayInactives: (0, pg_core_1.jsonb)('awayInactives'),
    lastFiveMeetings: (0, pg_core_1.jsonb)('lastFiveMeetings'),
    pregameCharts: (0, pg_core_1.jsonb)('pregameCharts'),
    postgameCharts: (0, pg_core_1.jsonb)('postgameCharts'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});
exports.scheduleBoxscoreTeams = (0, pg_core_1.pgTable)('schedule_boxscore_teams', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .references(() => exports.scheduleGames.id),
    teamExternalId: (0, pg_core_1.integer)('teamExternalId').notNull(),
    side: (0, exports.scheduleTeamSide)('side').notNull(),
    ...stats,
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('schedule_boxscore_teams_scheduleGameId_side_key').on(table.scheduleGameId, table.side),
    (0, pg_core_1.index)('schedule_boxscore_teams_scheduleGameId_idx').on(table.scheduleGameId),
    (0, pg_core_1.index)('schedule_boxscore_teams_teamExternalId_idx').on(table.teamExternalId),
]);
exports.scheduleBoxscorePlayers = (0, pg_core_1.pgTable)('schedule_boxscore_players', {
    id: id(),
    scheduleGameId: (0, pg_core_1.text)('scheduleGameId')
        .notNull()
        .references(() => exports.scheduleGames.id),
    playerId: (0, pg_core_1.text)('playerId')
        .notNull()
        .references(() => exports.players.id),
    playerExternalId: (0, pg_core_1.text)('playerExternalId').notNull(),
    teamExternalId: (0, pg_core_1.integer)('teamExternalId').notNull(),
    /** True when the feed lists this player in the starting five. */
    starter: (0, pg_core_1.boolean)('starter'),
    /**
     * The feed's box-score display order (starters first, then the bench). Kept
     * so a live box score can list players in the order the feed presents them,
     * which ordering by any stat would lose.
     */
    displayOrder: (0, pg_core_1.integer)('displayOrder'),
    ...stats,
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('schedule_boxscore_players_scheduleGameId_playerExternalId_key').on(table.scheduleGameId, table.playerExternalId),
    (0, pg_core_1.index)('schedule_boxscore_players_scheduleGameId_idx').on(table.scheduleGameId),
    (0, pg_core_1.index)('schedule_boxscore_players_playerId_idx').on(table.playerId),
    (0, pg_core_1.index)('schedule_boxscore_players_playerExternalId_idx').on(table.playerExternalId),
]);
/**
 * Append-only odds capture, one row per game/book/capture.
 *
 * The NBA CDN odds file only exposes current state, so every fetch is persisted
 * here to provide the audit trail needed to justify a locked payout.
 */
exports.gameOddsSnapshots = (0, pg_core_1.pgTable)('game_odds_snapshots', {
    id: id(),
    gameId: (0, pg_core_1.text)('gameId').notNull(),
    bookName: (0, pg_core_1.text)('bookName').notNull(),
    bookCountry: (0, pg_core_1.text)('bookCountry').notNull(),
    homeDecimal: (0, pg_core_1.doublePrecision)('homeDecimal').notNull(),
    awayDecimal: (0, pg_core_1.doublePrecision)('awayDecimal').notNull(),
    homeOpeningDecimal: (0, pg_core_1.doublePrecision)('homeOpeningDecimal'),
    awayOpeningDecimal: (0, pg_core_1.doublePrecision)('awayOpeningDecimal'),
    capturedAt: (0, pg_core_1.timestamp)('capturedAt', { precision: 3 }).notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.unique)('game_odds_snapshots_gameId_book_capturedAt_key').on(table.gameId, table.bookName, table.bookCountry, table.capturedAt),
    (0, pg_core_1.index)('game_odds_snapshots_gameId_capturedAt_idx').on(table.gameId, table.capturedAt),
]);
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
exports.predictionPicks = (0, pg_core_1.pgTable)('prediction_picks', {
    id: id(),
    userId: (0, pg_core_1.text)('userId')
        .notNull()
        .references(() => better_auth_schema_js_1.user.id, { onDelete: 'cascade' }),
    gameId: (0, pg_core_1.text)('gameId').notNull(),
    mode: (0, exports.predictionMode)('mode').notNull(),
    side: (0, exports.scheduleTeamSide)('side').notNull(),
    lockedDecimal: (0, pg_core_1.doublePrecision)('lockedDecimal'),
    lockedBook: (0, pg_core_1.text)('lockedBook'),
    lockedAt: (0, pg_core_1.timestamp)('lockedAt', { precision: 3 }),
    points: (0, pg_core_1.integer)('points'),
    status: (0, exports.predictionStatus)('status').notNull().default('pending'),
    settledAt: (0, pg_core_1.timestamp)('settledAt', { precision: 3 }),
    /**
     * Where the pick was placed. Null means the row predates the Discord bot,
     * i.e. a web pick: the column was added to a table that already had rows, so
     * a NOT NULL default would have had to invent a value for all of them and a
     * `'web'` default would then also silently cover a writer that forgot to set
     * it. Null reads as "web" in the leaderboard query, and every writer that
     * knows the answer sets it explicitly.
     */
    source: (0, exports.predictionSource)('source'),
    /**
     * The Discord server the pick was placed from, for the per-server board.
     * Null for a web pick, and overwritten on a re-pick elsewhere — last write
     * wins, the same as `side`.
     */
    guildId: (0, pg_core_1.text)('guildId'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('prediction_picks_userId_gameId_mode_key').on(table.userId, table.gameId, table.mode),
    (0, pg_core_1.index)('prediction_picks_userId_settledAt_idx').on(table.userId, table.settledAt),
    (0, pg_core_1.index)('prediction_picks_gameId_idx').on(table.gameId),
    (0, pg_core_1.index)('prediction_picks_status_idx').on(table.status),
    /** Serves a server board: one guild, one mode, settled rows only. */
    (0, pg_core_1.index)('prediction_picks_guildId_mode_status_idx').on(table.guildId, table.mode, table.status),
]);
/**
 * One row per game card the bot has posted into a server.
 *
 * The card's buttons are the only durable handle on a posted message, and both
 * sweepers (tip-off lock, settlement) need to find the cards they still have to
 * edit: the lock sweep selects on `lockedAt IS NULL` and the settlement sweep on
 * `settledAt IS NULL`, which is what the `(lockedAt, settledAt)` index is for.
 * Storing `lockedAt`/`settledAt` also makes each edit idempotent — a card with a
 * timestamp has already been edited, so a retry after a crash does nothing.
 *
 * One card per game per server: the unique key is what stops a re-post from
 * creating a second live card for the same game, and it is the conflict target
 * for an upsert.
 */
exports.discordCards = (0, pg_core_1.pgTable)('discord_cards', {
    id: id(),
    /** `schedule_games.gameId`, deliberately not a FK: the schedule sync deletes
     * games that drop out of a day's feed, and a card should outlive that. */
    gameId: (0, pg_core_1.text)('gameId').notNull(),
    guildId: (0, pg_core_1.text)('guildId').notNull(),
    channelId: (0, pg_core_1.text)('channelId').notNull(),
    messageId: (0, pg_core_1.text)('messageId').notNull(),
    /** Set once the card has been edited to disabled at tip-off. */
    lockedAt: (0, pg_core_1.timestamp)('lockedAt', { precision: 3 }),
    /** Set once the card has been edited with the final result. */
    settledAt: (0, pg_core_1.timestamp)('settledAt', { precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.unique)('discord_cards_gameId_guildId_key').on(table.gameId, table.guildId),
    (0, pg_core_1.index)('discord_cards_lockedAt_settledAt_idx').on(table.lockedAt, table.settledAt),
]);
/**
 * The bot's own Discord user ↔ IKnoBall user mapping.
 *
 * Better Auth already knows this for anyone who signed in with Discord
 * (`account.providerId = 'discord'`, `account.accountId = <Discord user id>`),
 * but `account` is Better Auth's table and it is free to rewrite it on a
 * provider change or an unlink. The bot reads on every button click, so it gets
 * its own row it can rely on. Both sides are unique, which is what enforces
 * "one Discord account per user and one user per Discord account" in the
 * database rather than in application code.
 */
exports.discordLinks = (0, pg_core_1.pgTable)('discord_links', {
    id: id(),
    userId: (0, pg_core_1.text)('userId')
        .notNull()
        .unique()
        .references(() => better_auth_schema_js_1.user.id, { onDelete: 'cascade' }),
    discordUserId: (0, pg_core_1.text)('discordUserId').notNull().unique(),
    createdAt: createdAt(),
});
/**
 * Per-guild configuration, written by `/setup`.
 *
 * The row is kept when the bot is removed (`leftAt` set) rather than deleted, so
 * a reinstall restores the channel and posting hour instead of asking the admin
 * to configure the server again — and so a server board's history still has a
 * guild to belong to. `guildId` is the Discord id and the primary key: there is
 * exactly one config per server and nothing else to key it by.
 *
 * The defaults are what make the bot work before `/setup` is run: 9am in
 * `America/New_York` is the NBA convention. Posting still needs a `channelId`,
 * which the admin must supply, so a defaulted row cannot post into a guessed
 * channel.
 */
exports.discordGuilds = (0, pg_core_1.pgTable)('discord_guilds', {
    guildId: (0, pg_core_1.text)('guildId').primaryKey(),
    channelId: (0, pg_core_1.text)('channelId').notNull(),
    /** Local hour, 0–23, in `timezone`. */
    postHour: (0, pg_core_1.integer)('postHour').notNull().default(9),
    /** IANA zone, validated against `Intl.supportedValuesOf('timeZone')`. */
    timezone: (0, pg_core_1.text)('timezone').notNull().default('America/New_York'),
    enabled: (0, pg_core_1.boolean)('enabled').notNull().default(true),
    installedAt: (0, pg_core_1.timestamp)('installedAt', { precision: 3 }).notNull().defaultNow(),
    /** Set on `guildDelete`; the row survives so a reinstall keeps its config. */
    leftAt: (0, pg_core_1.timestamp)('leftAt', { precision: 3 }),
});
/**
 * The bot's mirror of who is in which guild, refreshed from the gateway.
 *
 * The per-server leaderboard uses the "all picks by users who are members of
 * this server" definition, which is a join rather than a number: a pick carries
 * a `userId`, and turning that into "is this person in guild X" needs the
 * membership list on this side of the wire. The alternative — asking Discord for
 * the guild's members on every leaderboard render — is a paginated REST call per
 * query, and the board would be slow and rate-limit shaped for no benefit.
 * Mirroring the list makes the board one `EXISTS` over a local table.
 *
 * The `GUILD_MEMBERS` intent is what makes that mirror possible: the sync reads
 * the list when the bot joins a guild and keeps it current from join, leave, and
 * member-update events. So the intent is a requirement of definition B, not a
 * convenience — and this table is the only reason it is requested.
 *
 * `displayName` is stored for the same reason: the board falls back to the
 * Discord display name when a linked user has no `user.name`, and reading it
 * here avoids a REST lookup per row on every render.
 *
 * The composite key `(guildId, discordUserId)` is both the upsert target for the
 * sync (one row per person per server, so a re-sync overwrites instead of
 * duplicating) and the join path for the board, which always filters by guild.
 * The index on `discordUserId` answers the reverse question — which of my guilds
 * is this person in — which the button path asks when it resolves a click.
 */
exports.discordMembers = (0, pg_core_1.pgTable)('discord_members', {
    guildId: (0, pg_core_1.text)('guildId').notNull(),
    discordUserId: (0, pg_core_1.text)('discordUserId').notNull(),
    /** Discord display name, for the leaderboard's name fallback. */
    displayName: (0, pg_core_1.text)('displayName'),
    joinedAt: (0, pg_core_1.timestamp)('joinedAt', { precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (table) => [
    (0, pg_core_1.primaryKey)({
        name: 'discord_members_guildId_discordUserId_pk',
        columns: [table.guildId, table.discordUserId],
    }),
    (0, pg_core_1.index)('discord_members_discordUserId_idx').on(table.discordUserId),
]);
