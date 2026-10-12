CREATE TABLE "player_season_team_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"playerId" text NOT NULL,
	"season" text NOT NULL,
	"statsTimeframe" text NOT NULL,
	"teamAbbr" text NOT NULL,
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
	"stlTotal" double precision,
	"blkTotal" double precision,
	"stlPerGame" double precision,
	"blkPerGame" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_team_stats_playerId_season_timeframe_team_key" UNIQUE("playerId","season","statsTimeframe","teamAbbr")
);
--> statement-breakpoint
ALTER TABLE "player_season_team_stats" ADD CONSTRAINT "player_season_team_stats_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_season_team_stats_playerId_idx" ON "player_season_team_stats" USING btree ("playerId");