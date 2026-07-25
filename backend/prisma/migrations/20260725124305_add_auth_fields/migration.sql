-- AlterTable: Add email verification and password reset fields to users table
ALTER TABLE "users"
  ADD COLUMN "verification_token" TEXT,
  ADD COLUMN "verification_token_expiry" TIMESTAMP(3),
  ADD COLUMN "reset_token" TEXT,
  ADD COLUMN "reset_token_expiry" TIMESTAMP(3);
