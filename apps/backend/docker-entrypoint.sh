#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/database

DRIZZLE_KIT=$(find /app/node_modules/.bun -name "bin.cjs" -path "*/drizzle-kit/*" 2>/dev/null | head -1)

if [ -z "$DRIZZLE_KIT" ]; then
  echo "WARNING: drizzle-kit not found, skipping migrations"
else
  node "$DRIZZLE_KIT" migrate --config ./drizzle.config.ts
  echo "Migrations complete."
fi

echo "Starting app..."
exec bun run /app/apps/backend/dist/src/main.js
