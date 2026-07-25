-- Drop verification token columns from users table (moved to Redis)
ALTER TABLE "users"
  DROP COLUMN "verification_token",
  DROP COLUMN "verification_token_expiry";
