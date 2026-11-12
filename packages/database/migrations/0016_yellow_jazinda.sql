CREATE TABLE "mini_game_puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"puzzleDate" date NOT NULL,
	"puzzleNumber" integer NOT NULL,
	"seed" bigint NOT NULL,
	"startPlayerId" text NOT NULL,
	"targetPlayerId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "mini_game_puzzles_game_puzzleDate_key" UNIQUE("game","puzzleDate")
);
--> statement-breakpoint
ALTER TABLE "mini_game_results" ADD COLUMN "puzzleId" text;--> statement-breakpoint
CREATE INDEX "mini_game_puzzles_game_puzzleDate_idx" ON "mini_game_puzzles" USING btree ("game","puzzleDate");--> statement-breakpoint
ALTER TABLE "mini_game_results" ADD CONSTRAINT "mini_game_results_puzzleId_mini_game_puzzles_id_fk" FOREIGN KEY ("puzzleId") REFERENCES "public"."mini_game_puzzles"("id") ON DELETE restrict ON UPDATE no action;