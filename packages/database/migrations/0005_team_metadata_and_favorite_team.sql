-- Restores columns that `0003_jittery_mathemanic` and `0004_add_team_metadata`
-- created but which were never written into `meta/_journal.json`. Because the
-- journal drives `drizzle-kit migrate`, a database built from the journal alone
-- never received them, even though `meta/0004_snapshot.json` already listed
-- them — so the snapshot and the migrated schema disagreed.
--
-- `IF NOT EXISTS` makes this a no-op on any database where the columns were
-- applied by hand. The three NOT NULL columns are added with a temporary empty
-- default so they can be added to a `teams` table that already holds rows; the
-- default is then dropped, leaving the same shape as `schema.ts`.
--
-- Existing `teams` rows get an empty `city`/`conference`/`division`; re-run the
-- team seed to backfill real values.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "favorite_team" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "city" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "conference" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "conference" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "division" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "division" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "logoUrl" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "arena" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "headCoach" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "primaryColor" text;
