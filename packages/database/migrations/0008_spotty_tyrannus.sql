CREATE TABLE "player_shot_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"playerId" text NOT NULL,
	"season" text NOT NULL,
	"statsTimeframe" text NOT NULL,
	"zoneId" text NOT NULL,
	"fga" integer NOT NULL,
	"fgm" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "player_shot_zones_playerId_season_timeframe_zone_key" UNIQUE("playerId","season","statsTimeframe","zoneId")
);
--> statement-breakpoint
ALTER TABLE "player_shot_zones" ADD CONSTRAINT "player_shot_zones_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_shot_zones_playerId_idx" ON "player_shot_zones" USING btree ("playerId");