import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { DiscordLinkService } from '../discord-link/discord-link.service';

/**
 * Discord Activity → IKnoBall session.
 *
 * The activity runs inside Discord's iframe, where there is no login screen to
 * show: the only identity available is the Discord account that launched it. The
 * embedded app SDK hands the client a one-time OAuth `code`; this service trades
 * that code for a Discord access token **server-side** (the client secret never
 * reaches the browser), reads the Discord user, and resolves it to an existing
 * IKnoBall account with `DiscordLinkService` — the same resolution the bot uses,
 * so `/link` on the bot and "signed in with Discord" both work without a second
 * table.
 *
 * What it deliberately does not do is create a user. `users.email` is required,
 * and an account invented from a Discord id would carry a synthetic address the
 * rest of the product would treat as real. An unlinked Discord account gets a
 * 403 that says how to link, which is an action rather than a failure.
 *
 * The session it returns is a normal Better Auth session row, so the token works
 * through the `bearer()` plugin exactly like the `set-auth-token` header the web
 * app's sign-in returns. Nothing downstream needs to know the activity exists.
 */

const DISCORD_API = 'https://discord.com/api/v10';

/** What the activity gets back: a bearer token, and who it belongs to. */
export interface ActivitySession {
  /** Send as `Authorization: Bearer <token>` on every API call. */
  token: string;
  /** The Discord account that launched the activity. */
  discord: { id: string; name: string };
  /** The IKnoBall account the Discord account resolved to. */
  user: { id: string; name: string; image: string | null };
}

/** The bits of Discord's `/users/@me` this needs. */
interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

/**
 * The slice of Better Auth's internal adapter this uses. `createSession` is on
 * the runtime object but absent from the package's published types, so it is
 * described here rather than reached for through `any` at the call site.
 */
interface SessionMinter {
  internalAdapter: {
    createSession(userId: string): Promise<{ token: string }>;
  };
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly links: DiscordLinkService,
    private readonly auth: AuthService,
  ) {}

  /** Trade an SDK `code` for an IKnoBall session, or explain why it cannot. */
  async createSession(code: string): Promise<ActivitySession> {
    const discord = await this.discordUser(code);
    const resolved = await this.links.resolve(discord.id);

    if (!resolved.userId) {
      // Deliberately not a 401: the Discord identity is fine, the IKnoBall side
      // is missing, and the fix is a `/link` in Discord rather than a retry.
      this.logger.warn(
        `Activity sign-in refused: Discord ${discord.id} is not linked to an account.`,
      );
      throw new ForbiddenException(
        'This Discord account is not linked to an IKnoBall account yet. Run /link in Discord, then reopen the activity.',
      );
    }

    const token = await this.mintSession(resolved.userId);
    const profile = await this.profile(resolved.userId);

    // The one line that says the iframe got this far. A launch that the bot
    // accepted and this never logs means Discord opened the shell and the
    // activity itself never booted, which is a tunnel or URL-mapping problem
    // rather than a sign-in one.
    this.logger.log(`Activity session minted for Discord ${discord.id} → user ${profile.id}`);

    return {
      token,
      discord: { id: discord.id, name: discord.global_name?.trim() || discord.username },
      user: profile,
    };
  }

  /**
   * The OAuth code → access token → user chain.
   *
   * Every failure here is the same 401 to the caller: a code that was already
   * spent, a code minted for another app, and a token Discord will not honour are
   * indistinguishable to a player, and none of them is worth retrying.
   */
  private async discordUser(code: string): Promise<DiscordUser> {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      // A deployment without the app's credentials cannot authenticate anyone;
      // saying so plainly beats a 401 that looks like the player's fault.
      throw new ServiceUnavailableException('Discord sign-in is not configured on this server.');
    }

    const exchange = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!exchange.ok) {
      this.logger.warn(`Discord code exchange failed: ${exchange.status}`);
      throw new UnauthorizedException('Discord sign-in failed. Reopen the activity and try again.');
    }

    const { access_token: accessToken } = (await exchange.json()) as { access_token?: string };
    if (!accessToken) throw new UnauthorizedException('Discord sign-in failed.');

    const me = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) {
      this.logger.warn(`Discord /users/@me failed: ${me.status}`);
      throw new UnauthorizedException('Discord sign-in failed.');
    }

    return (await me.json()) as DiscordUser;
  }

  /**
   * A real session row, minted for a user who never typed a password.
   *
   * This is the same row a sign-in creates, which is the point: the bearer plugin
   * validates it, `@Session()` reads it, and it expires and revokes like any
   * other. A signed token would be a second, weaker kind of session to reason
   * about.
   */
  private async mintSession(userId: string): Promise<string> {
    const context = (await this.auth.instance.$context) as unknown as SessionMinter;
    const session = await context.internalAdapter.createSession(userId);
    return session.token;
  }

  /** Name and avatar for the top bar, from the account the Discord id resolved to. */
  private async profile(userId: string): Promise<ActivitySession['user']> {
    const context = (await this.auth.instance.$context) as unknown as {
      internalAdapter: {
        findUserById(id: string): Promise<{
          id: string;
          name: string;
          image?: string | null;
        } | null>;
      };
    };
    const found = await context.internalAdapter.findUserById(userId);
    if (!found) throw new UnauthorizedException('That IKnoBall account no longer exists.');

    return { id: found.id, name: found.name, image: found.image ?? null };
  }
}
