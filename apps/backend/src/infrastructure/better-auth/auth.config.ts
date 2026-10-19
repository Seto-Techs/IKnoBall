import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuthSchema, createDatabase } from '@iknoball/database';
import { betterAuth } from 'better-auth';
import type { DiscordOptions } from 'better-auth/social-providers';
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
          // Annotated so `prompt` keeps its literal type: left to inference it
          // widens to `string`, which `SocialProviders` rejects.
          discord: {
            clientId: discordClientId,
            clientSecret: discordClientSecret,
            scope: ['identify', 'email'],
            // Better Auth defaults this to "none", which Discord rejects unless the
            // user has authorised the app before. "consent" shows the approval
            // screen instead, so first-time sign-in and account linking both work.
            prompt: 'consent',
          } satisfies DiscordOptions,
        }
      : undefined;

  // Orb portals serve the app from a per-thread subdomain of onamp.dev, and the
  // hostname changes whenever the orb changes. Resolving the public origin from
  // the incoming request keeps OAuth redirect URIs and origin checks on whichever
  // hostname is actually serving, instead of a pinned URL that goes stale.
  const allowedHosts = [
    ...(process.env.AMP_ORB ? ['*.onamp.dev'] : []),
    'localhost:5173',
    'localhost:3000',
  ];

  return betterAuth({
    baseURL: {
      allowedHosts,
      protocol: 'auto',
      fallback: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
    },
    database: drizzleAdapter(database.db, { provider: 'pg', schema: betterAuthSchema }),
    user: {
      additionalFields: {
        favoriteTeam: { type: 'string', required: false },
      },
    },
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
      // Better Auth defaults this to 24h and measures it from `createdAt`, which
      // only a new sign-in moves — the daily refresh updates `expiresAt` and
      // `updatedAt`, never `createdAt`. So a 7-day session was only "fresh" for
      // its first day, and `list-sessions` and `unlink-account` returned 403 for
      // the remaining six. `change-password` is not freshness-gated, so keeping
      // the gate protected the less sensitive action while the more sensitive one
      // ran on any valid session. 0 treats every live session as fresh.
      freshAge: 0,
    },
    plugins: [bearer(), admin()],
  });
}
