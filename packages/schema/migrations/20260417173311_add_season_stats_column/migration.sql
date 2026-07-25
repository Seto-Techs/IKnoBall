/*
  Warnings:

  - You are about to drop the column `ast` on the `player_season_stats` table. All the data in the column will be lost.
  - You are about to drop the column `pts` on the `player_season_stats` table. All the data in the column will be lost.
  - You are about to drop the column `reb` on the `player_season_stats` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "player_season_stats" DROP COLUMN "ast",
DROP COLUMN "pts",
DROP COLUMN "reb",
ADD COLUMN     "astPerGame" DOUBLE PRECISION,
ADD COLUMN     "astTotal" DOUBLE PRECISION,
ADD COLUMN     "fg3Pct" DOUBLE PRECISION,
ADD COLUMN     "fgPct" DOUBLE PRECISION,
ADD COLUMN     "ftPct" DOUBLE PRECISION,
ADD COLUMN     "gp" INTEGER,
ADD COLUMN     "losses" INTEGER,
ADD COLUMN     "ptsPerGame" DOUBLE PRECISION,
ADD COLUMN     "ptsTotal" DOUBLE PRECISION,
ADD COLUMN     "rebPerGame" DOUBLE PRECISION,
ADD COLUMN     "rebTotal" DOUBLE PRECISION,
ADD COLUMN     "wins" INTEGER;
