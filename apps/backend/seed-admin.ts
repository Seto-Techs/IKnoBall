/**
 * Seed an admin user directly into the database.
 *
 * Creates user: admin@iknoball.dev / 12345678 (pre-verified, no email required)
 *
 * Usage: bun run apps/backend/seed-admin.ts
 */
import { randomBytes, scrypt } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/iknoball';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
  return `${salt}:${key.toString('hex')}`;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Check if admin already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
      'admin@iknoball.dev',
    ]);
    if (existing.rows.length > 0) {
      console.log('admin@iknoball.dev already exists (id=%s)', existing.rows[0].id);
      return;
    }

    const now = new Date();
    const userId = randomUUID();
    const passwordHash = await hashPassword('12345678');

    // Insert user — pre-verified so requireEmailVerification doesn't block login
    await pool.query(
      `INSERT INTO users (id, name, email, is_verified, created_at, updated_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, 'Admin', 'admin@iknoball.dev', true, now, now, true],
    );

    // Insert credential account — better-auth uses providerId="credential" for email/password
    await pool.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), userId, 'credential', userId, passwordHash, now, now],
    );

    console.log('✓ Created admin user: admin@iknoball.dev / 12345678');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
