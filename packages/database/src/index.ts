import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export * from './schema.js';

import { account, session, users, verification } from './schema.js';

/**
 * Schema object keyed by BetterAuth internal model names.
 *
 * BetterAuth models: `user`, `session`, `account`, `verification`
 * Our Drizzle table is named `users` (plural), so we alias it as `user`.
 */
export const betterAuthSchema = {
  user: users,
  session,
  account,
  verification,
};

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString });
  return { db: drizzle({ client: pool, schema }), pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
