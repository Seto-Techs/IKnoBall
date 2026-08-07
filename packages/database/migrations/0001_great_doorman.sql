DROP TABLE "categories" CASCADE;--> statement-breakpoint
DROP TABLE "expenses" CASCADE;--> statement-breakpoint
DROP TABLE "incomes" CASCADE;--> statement-breakpoint
DROP TABLE "wallets" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;