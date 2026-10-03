CREATE TYPE "public"."PredictionMode" AS ENUM('flat', 'weighted');--> statement-breakpoint
CREATE TYPE "public"."PredictionStatus" AS ENUM('pending', 'settled', 'voided');--> statement-breakpoint
CREATE TABLE "game_odds_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"bookName" text NOT NULL,
	"bookCountry" text NOT NULL,
	"homeDecimal" double precision NOT NULL,
	"awayDecimal" double precision NOT NULL,
	"homeOpeningDecimal" double precision,
	"awayOpeningDecimal" double precision,
	"capturedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "game_odds_snapshots_gameId_book_capturedAt_key" UNIQUE("gameId","bookName","bookCountry","capturedAt")
);
--> statement-breakpoint
CREATE TABLE "prediction_picks" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"gameId" text NOT NULL,
	"mode" "PredictionMode" NOT NULL,
	"side" "ScheduleTeamSide" NOT NULL,
	"lockedDecimal" double precision,
	"lockedBook" text,
	"lockedAt" timestamp (3),
	"points" integer,
	"status" "PredictionStatus" DEFAULT 'pending' NOT NULL,
	"settledAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_picks_userId_gameId_mode_key" UNIQUE("userId","gameId","mode")
);
--> statement-breakpoint
ALTER TABLE "prediction_picks" ADD CONSTRAINT "prediction_picks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_odds_snapshots_gameId_capturedAt_idx" ON "game_odds_snapshots" USING btree ("gameId","capturedAt");--> statement-breakpoint
CREATE INDEX "prediction_picks_userId_settledAt_idx" ON "prediction_picks" USING btree ("userId","settledAt");--> statement-breakpoint
CREATE INDEX "prediction_picks_gameId_idx" ON "prediction_picks" USING btree ("gameId");--> statement-breakpoint
CREATE INDEX "prediction_picks_status_idx" ON "prediction_picks" USING btree ("status");
