CREATE TYPE "public"."CategoryType" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."ScheduleTeamSide" AS ENUM('home', 'away');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"activity_log_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"category" text NOT NULL,
	"activity_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"is_success" boolean NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "CategoryType" NOT NULL,
	"color_hex" text NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"category_id" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"occurred_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"category_id" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"occurred_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "player_season_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"playerId" text NOT NULL,
	"season" text NOT NULL,
	"gp" integer,
	"wins" integer,
	"losses" integer,
	"fgPct" double precision,
	"fg3Pct" double precision,
	"ftPct" double precision,
	"ptsTotal" double precision,
	"rebTotal" double precision,
	"astTotal" double precision,
	"ptsPerGame" double precision,
	"rebPerGame" double precision,
	"astPerGame" double precision,
	"statsTimeframe" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_stats_playerId_season_statsTimeframe_key" UNIQUE("playerId","season","statsTimeframe")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"externalId" text NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"displayName" text,
	"slug" text,
	"position" text,
	"teamId" integer,
	"teamSlug" text,
	"isDefunct" boolean,
	"teamCity" text,
	"teamName" text,
	"teamAbbr" text,
	"jersey" text,
	"height" text,
	"weight" text,
	"college" text,
	"country" text,
	"draftYear" integer,
	"draftRound" integer,
	"draftPick" integer,
	"rosterStatus" double precision,
	"careerFrom" text,
	"careerTo" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "players_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE "schedule_boxscore_players" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"playerId" text NOT NULL,
	"playerExternalId" text NOT NULL,
	"teamExternalId" integer NOT NULL,
	"minutes" text,
	"fgMade" integer,
	"fgAttempted" integer,
	"fgPct" double precision,
	"fg3Made" integer,
	"fg3Attempted" integer,
	"fg3Pct" double precision,
	"ftMade" integer,
	"ftAttempted" integer,
	"ftPct" double precision,
	"oreb" integer,
	"dreb" integer,
	"reb" integer,
	"ast" integer,
	"stl" integer,
	"blk" integer,
	"tov" integer,
	"pf" integer,
	"pts" integer,
	"plusMinus" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_boxscore_players_scheduleGameId_playerExternalId_key" UNIQUE("scheduleGameId","playerExternalId")
);
--> statement-breakpoint
CREATE TABLE "schedule_boxscore_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"gameCode" text NOT NULL,
	"gameStatus" integer NOT NULL,
	"gameStatusText" text NOT NULL,
	"period" integer NOT NULL,
	"gameClock" text,
	"gameTimeUTC" timestamp (3),
	"gameEt" timestamp (3),
	"duration" text,
	"attendance" integer,
	"sellout" integer,
	"seriesGameNumber" text,
	"gameLabel" text,
	"gameSubLabel" text,
	"seriesText" text,
	"ifNecessary" boolean NOT NULL,
	"isNeutral" boolean NOT NULL,
	"arenaId" integer,
	"arenaName" text,
	"arenaCity" text,
	"arenaState" text,
	"arenaCountry" text,
	"arenaTimezone" text,
	"arenaStreet" text,
	"arenaPostalCode" text,
	"homeTeamId" integer NOT NULL,
	"homeScore" integer,
	"homeInBonus" text,
	"homeTimeouts" integer,
	"homeSeed" integer,
	"homePeriods" jsonb,
	"homePlayers" jsonb,
	"homeInactives" jsonb,
	"awayTeamId" integer NOT NULL,
	"awayTeamName" text,
	"awayTeamCity" text,
	"awayTeamTricode" text,
	"awayTeamSlug" text,
	"awayTeamWins" integer,
	"awayTeamLosses" integer,
	"awayScore" integer,
	"awayInBonus" text,
	"awayTimeouts" integer,
	"awaySeed" integer,
	"awayStatistics" jsonb,
	"awayPeriods" jsonb,
	"awayPlayers" jsonb,
	"awayInactives" jsonb,
	"lastFiveMeetings" jsonb,
	"pregameCharts" jsonb,
	"postgameCharts" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_boxscore_summaries_scheduleGameId_unique" UNIQUE("scheduleGameId")
);
--> statement-breakpoint
CREATE TABLE "schedule_boxscore_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"teamExternalId" integer NOT NULL,
	"side" "ScheduleTeamSide" NOT NULL,
	"minutes" text,
	"fgMade" integer,
	"fgAttempted" integer,
	"fgPct" double precision,
	"fg3Made" integer,
	"fg3Attempted" integer,
	"fg3Pct" double precision,
	"ftMade" integer,
	"ftAttempted" integer,
	"ftPct" double precision,
	"oreb" integer,
	"dreb" integer,
	"reb" integer,
	"ast" integer,
	"stl" integer,
	"blk" integer,
	"tov" integer,
	"pf" integer,
	"pts" integer,
	"plusMinus" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_boxscore_teams_scheduleGameId_side_key" UNIQUE("scheduleGameId","side")
);
--> statement-breakpoint
CREATE TABLE "schedule_days" (
	"id" text PRIMARY KEY NOT NULL,
	"gameDate" date NOT NULL,
	"seasonYear" text NOT NULL,
	"leagueId" text NOT NULL,
	"metaVersion" integer NOT NULL,
	"metaRequest" text NOT NULL,
	"metaTime" timestamp (3) NOT NULL,
	"hash" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_days_gameDate_seasonYear_leagueId_key" UNIQUE("gameDate","seasonYear","leagueId")
);
--> statement-breakpoint
CREATE TABLE "schedule_games" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleDayId" text NOT NULL,
	"gameId" text NOT NULL,
	"gameDate" date NOT NULL,
	"gameCode" text NOT NULL,
	"gameStatus" integer NOT NULL,
	"gameStatusText" text NOT NULL,
	"gameSequence" integer NOT NULL,
	"gameDateEst" timestamp (3),
	"gameTimeEst" timestamp (3),
	"gameDateTimeEst" timestamp (3),
	"gameDateUTC" timestamp (3),
	"gameTimeUTC" timestamp (3),
	"gameDateTimeUTC" timestamp (3),
	"awayTeamTime" timestamp (3),
	"homeTeamTime" timestamp (3),
	"day" text,
	"monthNum" integer,
	"weekNumber" integer,
	"weekName" text,
	"ifNecessary" text,
	"seriesGameNumber" text,
	"gameLabel" text,
	"gameSubLabel" text,
	"seriesText" text,
	"arenaName" text,
	"arenaState" text,
	"arenaCity" text,
	"postponedStatus" text,
	"branchLink" text,
	"gameSubtype" text,
	"isNeutral" boolean NOT NULL,
	"homeTeamId" integer,
	"homeTeamName" text,
	"homeTeamCity" text,
	"homeTeamTricode" text,
	"homeTeamSlug" text,
	"homeTeamWins" integer,
	"homeTeamLosses" integer,
	"homeTeamScore" integer,
	"homeTeamSeed" integer,
	"awayTeamId" integer,
	"awayTeamName" text,
	"awayTeamCity" text,
	"awayTeamTricode" text,
	"awayTeamSlug" text,
	"awayTeamWins" integer,
	"awayTeamLosses" integer,
	"awayTeamScore" integer,
	"awayTeamSeed" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_games_gameId_unique" UNIQUE("gameId")
);
--> statement-breakpoint
CREATE TABLE "schedule_points_leaders" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"personId" integer,
	"firstName" text,
	"lastName" text,
	"teamId" integer,
	"teamCity" text,
	"teamName" text,
	"teamTricode" text,
	"points" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"externalId" text NOT NULL,
	"name" text NOT NULL,
	"fullName" text NOT NULL,
	"abbreviation" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "teams_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_boxscore_players" ADD CONSTRAINT "schedule_boxscore_players_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_boxscore_players" ADD CONSTRAINT "schedule_boxscore_players_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_boxscore_summaries" ADD CONSTRAINT "schedule_boxscore_summaries_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_boxscore_teams" ADD CONSTRAINT "schedule_boxscore_teams_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_games" ADD CONSTRAINT "schedule_games_scheduleDayId_schedule_days_id_fk" FOREIGN KEY ("scheduleDayId") REFERENCES "public"."schedule_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_points_leaders" ADD CONSTRAINT "schedule_points_leaders_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "categories_user_id_type_idx" ON "categories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "categories_user_id_name_idx" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "categories_user_id_deleted_at_idx" ON "categories" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "expenses_user_id_occurred_at_idx" ON "expenses" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_user_id_category_id_idx" ON "expenses" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "incomes_user_id_occurred_at_idx" ON "incomes" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incomes_user_id_category_id_idx" ON "incomes" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "player_season_stats_playerId_idx" ON "player_season_stats" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "schedule_boxscore_players_scheduleGameId_idx" ON "schedule_boxscore_players" USING btree ("scheduleGameId");--> statement-breakpoint
CREATE INDEX "schedule_boxscore_players_playerId_idx" ON "schedule_boxscore_players" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "schedule_boxscore_players_playerExternalId_idx" ON "schedule_boxscore_players" USING btree ("playerExternalId");--> statement-breakpoint
CREATE INDEX "schedule_boxscore_teams_scheduleGameId_idx" ON "schedule_boxscore_teams" USING btree ("scheduleGameId");--> statement-breakpoint
CREATE INDEX "schedule_boxscore_teams_teamExternalId_idx" ON "schedule_boxscore_teams" USING btree ("teamExternalId");--> statement-breakpoint
CREATE INDEX "schedule_days_gameDate_idx" ON "schedule_days" USING btree ("gameDate");--> statement-breakpoint
CREATE INDEX "schedule_games_gameDate_idx" ON "schedule_games" USING btree ("gameDate");--> statement-breakpoint
CREATE INDEX "schedule_games_scheduleDayId_idx" ON "schedule_games" USING btree ("scheduleDayId");--> statement-breakpoint
CREATE INDEX "schedule_points_leaders_scheduleGameId_idx" ON "schedule_points_leaders" USING btree ("scheduleGameId");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");