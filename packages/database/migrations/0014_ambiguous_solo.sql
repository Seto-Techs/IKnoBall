CREATE TABLE "mini_game_results" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"game" text NOT NULL,
	"puzzleDate" date NOT NULL,
	"puzzleNumber" integer NOT NULL,
	"startPlayerId" text NOT NULL,
	"targetPlayerId" text NOT NULL,
	"players" integer NOT NULL,
	"par" integer NOT NULL,
	"blocks" integer NOT NULL,
	"chain" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "mini_game_results_userId_game_puzzleDate_key" UNIQUE("userId","game","puzzleDate")
);
--> statement-breakpoint
ALTER TABLE "mini_game_results" ADD CONSTRAINT "mini_game_results_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mini_game_results_userId_game_puzzleDate_idx" ON "mini_game_results" USING btree ("userId","game","puzzleDate");