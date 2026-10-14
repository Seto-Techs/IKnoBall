CREATE TABLE "player_game_shot_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"playerId" text NOT NULL,
	"season" text NOT NULL,
	"statsTimeframe" text NOT NULL,
	"zoneId" text NOT NULL,
	"fga" integer NOT NULL,
	"fgm" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_shot_zones_game_player_zone_key" UNIQUE("scheduleGameId","playerId","zoneId")
);
--> statement-breakpoint
CREATE TABLE "shot_zone_game_syncs" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleGameId" text NOT NULL,
	"attemptCount" integer NOT NULL,
	"playerCount" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "shot_zone_game_syncs_scheduleGameId_unique" UNIQUE("scheduleGameId")
);
--> statement-breakpoint
DROP TABLE "player_shot_zones" CASCADE;--> statement-breakpoint
ALTER TABLE "player_game_shot_zones" ADD CONSTRAINT "player_game_shot_zones_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_shot_zones" ADD CONSTRAINT "player_game_shot_zones_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_zone_game_syncs" ADD CONSTRAINT "shot_zone_game_syncs_scheduleGameId_schedule_games_id_fk" FOREIGN KEY ("scheduleGameId") REFERENCES "public"."schedule_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_game_shot_zones_player_season_idx" ON "player_game_shot_zones" USING btree ("playerId","season","statsTimeframe");--> statement-breakpoint
CREATE INDEX "shot_zone_game_syncs_scheduleGameId_idx" ON "shot_zone_game_syncs" USING btree ("scheduleGameId");