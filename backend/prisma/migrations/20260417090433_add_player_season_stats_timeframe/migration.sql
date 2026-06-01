/*
  Warnings:

  - A unique constraint covering the columns `[playerId,season,statsTimeframe]` on the table `player_season_stats` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "player_season_stats_playerId_season_key";

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stats_playerId_season_statsTimeframe_key" ON "player_season_stats"("playerId", "season", "statsTimeframe");
