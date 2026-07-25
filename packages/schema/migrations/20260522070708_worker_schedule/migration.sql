-- CreateTable
CREATE TABLE "schedule_days" (
    "id" TEXT NOT NULL,
    "gameDate" DATE NOT NULL,
    "seasonYear" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "metaVersion" INTEGER NOT NULL,
    "metaRequest" TEXT NOT NULL,
    "metaTime" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_games" (
    "id" TEXT NOT NULL,
    "scheduleDayId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameDate" DATE NOT NULL,
    "gameCode" TEXT NOT NULL,
    "gameStatus" INTEGER NOT NULL,
    "gameStatusText" TEXT NOT NULL,
    "gameSequence" INTEGER NOT NULL,
    "gameDateEst" TIMESTAMP(3),
    "gameTimeEst" TIMESTAMP(3),
    "gameDateTimeEst" TIMESTAMP(3),
    "gameDateUTC" TIMESTAMP(3),
    "gameTimeUTC" TIMESTAMP(3),
    "gameDateTimeUTC" TIMESTAMP(3),
    "awayTeamTime" TIMESTAMP(3),
    "homeTeamTime" TIMESTAMP(3),
    "day" TEXT,
    "monthNum" INTEGER,
    "weekNumber" INTEGER,
    "weekName" TEXT,
    "ifNecessary" TEXT,
    "seriesGameNumber" TEXT,
    "gameLabel" TEXT,
    "gameSubLabel" TEXT,
    "seriesText" TEXT,
    "arenaName" TEXT,
    "arenaState" TEXT,
    "arenaCity" TEXT,
    "postponedStatus" TEXT,
    "branchLink" TEXT,
    "gameSubtype" TEXT,
    "isNeutral" BOOLEAN NOT NULL,
    "homeTeamId" INTEGER,
    "homeTeamName" TEXT,
    "homeTeamCity" TEXT,
    "homeTeamTricode" TEXT,
    "homeTeamSlug" TEXT,
    "homeTeamWins" INTEGER,
    "homeTeamLosses" INTEGER,
    "homeTeamScore" INTEGER,
    "homeTeamSeed" INTEGER,
    "awayTeamId" INTEGER,
    "awayTeamName" TEXT,
    "awayTeamCity" TEXT,
    "awayTeamTricode" TEXT,
    "awayTeamSlug" TEXT,
    "awayTeamWins" INTEGER,
    "awayTeamLosses" INTEGER,
    "awayTeamScore" INTEGER,
    "awayTeamSeed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_points_leaders" (
    "id" TEXT NOT NULL,
    "scheduleGameId" TEXT NOT NULL,
    "personId" INTEGER,
    "firstName" TEXT,
    "lastName" TEXT,
    "teamId" INTEGER,
    "teamCity" TEXT,
    "teamName" TEXT,
    "teamTricode" TEXT,
    "points" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_points_leaders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_days_gameDate_idx" ON "schedule_days"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_days_gameDate_seasonYear_leagueId_key" ON "schedule_days"("gameDate", "seasonYear", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_games_gameId_key" ON "schedule_games"("gameId");

-- CreateIndex
CREATE INDEX "schedule_games_gameDate_idx" ON "schedule_games"("gameDate");

-- CreateIndex
CREATE INDEX "schedule_games_scheduleDayId_idx" ON "schedule_games"("scheduleDayId");

-- CreateIndex
CREATE INDEX "schedule_points_leaders_scheduleGameId_idx" ON "schedule_points_leaders"("scheduleGameId");

-- AddForeignKey
ALTER TABLE "schedule_games" ADD CONSTRAINT "schedule_games_scheduleDayId_fkey" FOREIGN KEY ("scheduleDayId") REFERENCES "schedule_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_points_leaders" ADD CONSTRAINT "schedule_points_leaders_scheduleGameId_fkey" FOREIGN KEY ("scheduleGameId") REFERENCES "schedule_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
