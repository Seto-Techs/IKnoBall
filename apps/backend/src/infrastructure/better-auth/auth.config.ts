import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuthSchema, createDatabase } from '@iknoball/database';
import { betterAuth } from 'better-auth';
import { bearer, admin } from 'better-auth/plugins';
import { EmailService } from '../email/email.service';

export function createAuth(email: EmailService) {
  const database = createDatabase(
    process.env.DATABASE_URL ?? 'postgresql://localhost:5432/iknoball',
  );
  const discordClientId = process.env.DISCORD_CLIENT_ID;
  const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
  const socialProviders =
    discordClientId && discordClientSecret
      ? {
          discord: {
            clientId: discordClientId,
            clientSecret: discordClientSecret,
            scope: ['identify', 'email'],
          },
        }
      : undefined;

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
    database: drizzleAdapter(database.db, { provider: 'pg', schema: betterAuthSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await email.sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          link: url,
          subject: 'Reset your IKnoBall password',
          fromKey: 'reset',
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 900, // 15 minutes
      sendVerificationEmail: async ({ user, url }) => {
        // Extract token from the backend-generated URL and build a frontend URL
        const token = new URL(url).searchParams.get('token');
        const frontendUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/auth/verify?token=${token}`;
        await email.sendVerifyEmail({
          to: user.email,
          name: user.name,
          link: frontendUrl,
          subject: 'Verify your IKnoBall account',
          fromKey: 'verify',
        });
      },
    },
    socialProviders,
    trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
    basePath: '/auth',
    session: {
      cookieCache: { enabled: false },
    },
    plugins: [bearer(), admin()],
  });
}
