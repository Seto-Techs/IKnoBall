/*
  Warnings:

  - You are about to drop the `box_score_raw` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `game_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `games` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `player_box_scores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `prediction_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `predictions` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ScheduleTeamSide" AS ENUM ('home', 'away');

-- DropForeignKey
ALTER TABLE "box_score_raw" DROP CONSTRAINT "box_score_raw_gameId_fkey";

-- DropForeignKey
ALTER TABLE "game_results" DROP CONSTRAINT "game_results_actualWinnerTeamId_fkey";

-- DropForeignKey
ALTER TABLE "game_results" DROP CONSTRAINT "game_results_gameId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_awayTeamId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_homeTeamId_fkey";

-- DropForeignKey
ALTER TABLE "player_box_scores" DROP CONSTRAINT "player_box_scores_gameId_fkey";

-- DropForeignKey
ALTER TABLE "player_box_scores" DROP CONSTRAINT "player_box_scores_playerId_fkey";

-- DropForeignKey
ALTER TABLE "player_box_scores" DROP CONSTRAINT "player_box_scores_teamId_fkey";

-- DropForeignKey
ALTER TABLE "prediction_results" DROP CONSTRAINT "prediction_results_gameId_fkey";

-- DropForeignKey
ALTER TABLE "prediction_results" DROP CONSTRAINT "prediction_results_predictionId_fkey";

-- DropForeignKey
ALTER TABLE "prediction_results" DROP CONSTRAINT "prediction_results_userId_fkey";

-- DropForeignKey
ALTER TABLE "predictions" DROP CONSTRAINT "predictions_gameId_fkey";

-- DropForeignKey
ALTER TABLE "predictions" DROP CONSTRAINT "predictions_predictedWinnerTeamId_fkey";

-- DropForeignKey
ALTER TABLE "predictions" DROP CONSTRAINT "predictions_userId_fkey";

-- DropTable
DROP TABLE "box_score_raw";

-- DropTable
DROP TABLE "game_results";

-- DropTable
DROP TABLE "games";

-- DropTable
DROP TABLE "player_box_scores";

-- DropTable
DROP TABLE "prediction_results";

-- DropTable
DROP TABLE "predictions";

-- DropEnum
DROP TYPE "GameStatus";

-- CreateTable
CREATE TABLE "schedule_boxscore_summaries" (
    "id" TEXT NOT NULL,
    "scheduleGameId" TEXT NOT NULL,
    "gameCode" TEXT NOT NULL,
    "gameStatus" INTEGER NOT NULL,
    "gameStatusText" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "gameClock" TEXT,
    "gameTimeUTC" TIMESTAMP(3),
    "gameEt" TIMESTAMP(3),
    "duration" TEXT,
    "attendance" INTEGER,
    "sellout" INTEGER,
    "seriesGameNumber" TEXT,
    "gameLabel" TEXT,
    "gameSubLabel" TEXT,
    "seriesText" TEXT,
    "ifNecessary" BOOLEAN NOT NULL,
    "isNeutral" BOOLEAN NOT NULL,
    "arenaId" INTEGER,
    "arenaName" TEXT,
    "arenaCity" TEXT,
    "arenaState" TEXT,
    "arenaCountry" TEXT,
    "arenaTimezone" TEXT,
    "arenaStreet" TEXT,
    "arenaPostalCode" TEXT,
    "homeTeamId" INTEGER NOT NULL,
    "homeScore" INTEGER,
    "homeInBonus" TEXT,
    "homeTimeouts" INTEGER,
    "homeSeed" INTEGER,
    "homePeriods" JSONB,
    "homePlayers" JSONB,
    "homeInactives" JSONB,
    "awayTeamId" INTEGER NOT NULL,
    "awayTeamName" TEXT,
    "awayTeamCity" TEXT,
    "awayTeamTricode" TEXT,
    "awayTeamSlug" TEXT,
    "awayTeamWins" INTEGER,
    "awayTeamLosses" INTEGER,
    "awayScore" INTEGER,
    "awayInBonus" TEXT,
    "awayTimeouts" INTEGER,
    "awaySeed" INTEGER,
    "awayStatistics" JSONB,
    "awayPeriods" JSONB,
    "awayPlayers" JSONB,
    "awayInactives" JSONB,
    "lastFiveMeetings" JSONB,
    "pregameCharts" JSONB,
    "postgameCharts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_boxscore_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_boxscore_teams" (
    "id" TEXT NOT NULL,
    "scheduleGameId" TEXT NOT NULL,
    "teamExternalId" INTEGER NOT NULL,
    "side" "ScheduleTeamSide" NOT NULL,
    "minutes" TEXT,
    "fgMade" INTEGER,
    "fgAttempted" INTEGER,
    "fgPct" DOUBLE PRECISION,
    "fg3Made" INTEGER,
    "fg3Attempted" INTEGER,
    "fg3Pct" DOUBLE PRECISION,
    "ftMade" INTEGER,
    "ftAttempted" INTEGER,
    "ftPct" DOUBLE PRECISION,
    "oreb" INTEGER,
    "dreb" INTEGER,
    "reb" INTEGER,
    "ast" INTEGER,
    "stl" INTEGER,
    "blk" INTEGER,
    "tov" INTEGER,
    "pf" INTEGER,
    "pts" INTEGER,
    "plusMinus" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_boxscore_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_boxscore_players" (
    "id" TEXT NOT NULL,
    "scheduleGameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerExternalId" TEXT NOT NULL,
    "teamExternalId" INTEGER NOT NULL,
    "minutes" TEXT,
    "fgMade" INTEGER,
    "fgAttempted" INTEGER,
    "fgPct" DOUBLE PRECISION,
    "fg3Made" INTEGER,
    "fg3Attempted" INTEGER,
    "fg3Pct" DOUBLE PRECISION,
    "ftMade" INTEGER,
    "ftAttempted" INTEGER,
    "ftPct" DOUBLE PRECISION,
    "oreb" INTEGER,
    "dreb" INTEGER,
    "reb" INTEGER,
    "ast" INTEGER,
    "stl" INTEGER,
    "blk" INTEGER,
    "tov" INTEGER,
    "pf" INTEGER,
    "pts" INTEGER,
    "plusMinus" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_boxscore_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_boxscore_summaries_scheduleGameId_key" ON "schedule_boxscore_summaries"("scheduleGameId");

-- CreateIndex
CREATE INDEX "schedule_boxscore_teams_scheduleGameId_idx" ON "schedule_boxscore_teams"("scheduleGameId");

-- CreateIndex
CREATE INDEX "schedule_boxscore_teams_teamExternalId_idx" ON "schedule_boxscore_teams"("teamExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_boxscore_teams_scheduleGameId_side_key" ON "schedule_boxscore_teams"("scheduleGameId", "side");

-- CreateIndex
CREATE INDEX "schedule_boxscore_players_scheduleGameId_idx" ON "schedule_boxscore_players"("scheduleGameId");

-- CreateIndex
CREATE INDEX "schedule_boxscore_players_playerId_idx" ON "schedule_boxscore_players"("playerId");

-- CreateIndex
CREATE INDEX "schedule_boxscore_players_playerExternalId_idx" ON "schedule_boxscore_players"("playerExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_boxscore_players_scheduleGameId_playerExternalId_key" ON "schedule_boxscore_players"("scheduleGameId", "playerExternalId");

-- AddForeignKey
ALTER TABLE "schedule_boxscore_summaries" ADD CONSTRAINT "schedule_boxscore_summaries_scheduleGameId_fkey" FOREIGN KEY ("scheduleGameId") REFERENCES "schedule_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_boxscore_teams" ADD CONSTRAINT "schedule_boxscore_teams_scheduleGameId_fkey" FOREIGN KEY ("scheduleGameId") REFERENCES "schedule_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_boxscore_players" ADD CONSTRAINT "schedule_boxscore_players_scheduleGameId_fkey" FOREIGN KEY ("scheduleGameId") REFERENCES "schedule_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_boxscore_players" ADD CONSTRAINT "schedule_boxscore_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
