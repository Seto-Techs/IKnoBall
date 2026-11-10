CREATE TABLE "player_team_seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"playerId" text NOT NULL,
	"season" text NOT NULL,
	"seasonType" text NOT NULL,
	"teamAbbr" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "player_team_seasons_playerId_season_type_team_key" UNIQUE("playerId","season","seasonType","teamAbbr")
);
--> statement-breakpoint
ALTER TABLE "player_team_seasons" ADD CONSTRAINT "player_team_seasons_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_team_seasons_playerId_idx" ON "player_team_seasons" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "player_team_seasons_lookup_idx" ON "player_team_seasons" USING btree ("season","seasonType","teamAbbr");