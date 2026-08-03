import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuthSchema, createDatabase } from '@iknoball/database';
import { eq } from 'drizzle-orm';

const EMAIL = 'rakaiseto@gmail.com';
const PASSWORD = '12345678';
const NAME = 'Raka';

async function main() {
  const db = createDatabase(process.env.DATABASE_URL);

  // Check if user already exists
  const existing = await db.db
    .select({ id: betterAuthSchema.user.id })
    .from(betterAuthSchema.user)
    .where(eq(betterAuthSchema.user.email, EMAIL))
    .execute();

  if (existing.length > 0) {
    console.log(`User ${EMAIL} already exists, skipping seed.`);
    await db.pool.end();
    return;
  }

  // Create the user via Better Auth's programmatic API.
  // We create a minimal auth instance that shares the same database and
  // uses the Better Auth plugin system to hash the password correctly.
  //
  // The signUpEmail endpoint normally checks CSRF/origin. We set trustedOrigins
  // to include an empty origin so the in-process call passes.
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    database: drizzleAdapter(db.db, { provider: 'pg', schema: betterAuthSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async () => {},
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      sendVerificationEmail: async () => {},
    },
    trustedOrigins: ['*'],
    basePath: '/auth',
  });

  const result = await auth.api.signUpEmail({
    body: { name: NAME, email: EMAIL, password: PASSWORD },
    headers: new Headers({
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    }),
  });

  console.log('User created:', result.user?.email ?? 'ok');

  // Mark email as verified and set admin role
  await db.db
    .update(betterAuthSchema.user)
    .set({ emailVerified: true, role: 'admin' })
    .where(eq(betterAuthSchema.user.email, EMAIL))
    .execute();
  console.log(`User ${EMAIL} is now admin and ready.`);
  await db.pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
