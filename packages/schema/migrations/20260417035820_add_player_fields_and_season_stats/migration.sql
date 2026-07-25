-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('scheduled', 'live', 'finished');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('discord');

-- CreateTable
CREATE TABLE "box_score_raw" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "rawBoxScoreJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_score_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_box_scores" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_box_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "externalGameId" TEXT NOT NULL,
    "gameDate" DATE NOT NULL,
    "tipoffAt" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "rawScheduleJson" JSONB,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_results" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "actualWinnerTeamId" TEXT NOT NULL,
    "finalHomeScore" INTEGER NOT NULL,
    "finalAwayScore" INTEGER NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "rawResultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "slug" TEXT,
    "position" TEXT,
    "teamId" INTEGER,
    "teamSlug" TEXT,
    "isDefunct" BOOLEAN,
    "teamCity" TEXT,
    "teamName" TEXT,
    "teamAbbr" TEXT,
    "jersey" TEXT,
    "height" TEXT,
    "weight" TEXT,
    "college" TEXT,
    "country" TEXT,
    "draftYear" INTEGER,
    "draftRound" INTEGER,
    "draftPick" INTEGER,
    "rosterStatus" DOUBLE PRECISION,
    "careerFrom" TEXT,
    "careerTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_season_stats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "pts" DOUBLE PRECISION,
    "reb" DOUBLE PRECISION,
    "ast" DOUBLE PRECISION,
    "statsTimeframe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "predictedWinnerTeamId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_results" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prediction_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "rawProfileJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "box_score_raw_gameId_key" ON "box_score_raw"("gameId");

-- CreateIndex
CREATE INDEX "player_box_scores_gameId_idx" ON "player_box_scores"("gameId");

-- CreateIndex
CREATE INDEX "player_box_scores_playerId_idx" ON "player_box_scores"("playerId");

-- CreateIndex
CREATE INDEX "player_box_scores_teamId_idx" ON "player_box_scores"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "player_box_scores_gameId_playerId_key" ON "player_box_scores"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "games_externalGameId_key" ON "games"("externalGameId");

-- CreateIndex
CREATE INDEX "games_gameDate_idx" ON "games"("gameDate");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "games_tipoffAt_idx" ON "games"("tipoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_results_gameId_key" ON "game_results"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_externalId_key" ON "teams"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "players_externalId_key" ON "players"("externalId");

-- CreateIndex
CREATE INDEX "player_season_stats_playerId_idx" ON "player_season_stats"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stats_playerId_season_key" ON "player_season_stats"("playerId", "season");

-- CreateIndex
CREATE INDEX "predictions_gameId_idx" ON "predictions"("gameId");

-- CreateIndex
CREATE INDEX "predictions_userId_idx" ON "predictions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "predictions_userId_gameId_key" ON "predictions"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_results_predictionId_key" ON "prediction_results"("predictionId");

-- CreateIndex
CREATE INDEX "prediction_results_gameId_idx" ON "prediction_results"("gameId");

-- CreateIndex
CREATE INDEX "prediction_results_userId_idx" ON "prediction_results"("userId");

-- CreateIndex
CREATE INDEX "prediction_results_isCorrect_idx" ON "prediction_results"("isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_providerUserId_key" ON "user_identities"("provider", "providerUserId");

-- AddForeignKey
ALTER TABLE "box_score_raw" ADD CONSTRAINT "box_score_raw_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_box_scores" ADD CONSTRAINT "player_box_scores_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_box_scores" ADD CONSTRAINT "player_box_scores_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_box_scores" ADD CONSTRAINT "player_box_scores_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_actualWinnerTeamId_fkey" FOREIGN KEY ("actualWinnerTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_predictedWinnerTeamId_fkey" FOREIGN KEY ("predictedWinnerTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_results" ADD CONSTRAINT "prediction_results_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "predictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_results" ADD CONSTRAINT "prediction_results_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_results" ADD CONSTRAINT "prediction_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
