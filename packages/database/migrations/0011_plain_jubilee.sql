CREATE TYPE "public"."PredictionSource" AS ENUM('web', 'discord');--> statement-breakpoint
CREATE TABLE "discord_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"guildId" text NOT NULL,
	"channelId" text NOT NULL,
	"messageId" text NOT NULL,
	"lockedAt" timestamp (3),
	"settledAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "discord_cards_gameId_guildId_key" UNIQUE("gameId","guildId")
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"guildId" text PRIMARY KEY NOT NULL,
	"channelId" text NOT NULL,
	"postHour" integer DEFAULT 9 NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"installedAt" timestamp (3) DEFAULT now() NOT NULL,
	"leftAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "discord_links" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"discordUserId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "discord_links_userId_unique" UNIQUE("userId"),
	CONSTRAINT "discord_links_discordUserId_unique" UNIQUE("discordUserId")
);
--> statement-breakpoint
ALTER TABLE "prediction_picks" ADD COLUMN "source" "PredictionSource";--> statement-breakpoint
ALTER TABLE "prediction_picks" ADD COLUMN "guildId" text;--> statement-breakpoint
ALTER TABLE "discord_links" ADD CONSTRAINT "discord_links_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_cards_lockedAt_settledAt_idx" ON "discord_cards" USING btree ("lockedAt","settledAt");--> statement-breakpoint
CREATE INDEX "prediction_picks_guildId_mode_status_idx" ON "prediction_picks" USING btree ("guildId","mode","status");