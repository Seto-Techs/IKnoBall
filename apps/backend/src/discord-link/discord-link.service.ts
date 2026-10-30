import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { account, discordLinks } from '@iknoball/database';
import { DatabaseService } from '../infrastructure/database/database.service';
import { RedisService } from '../infrastructure/redis/redis.service';

/**
 * Discord account ↔ IKnoBall account, as DISC-06 settled it (path A).
 *
 * Two lookups, in this order, and the order is the whole design:
 *
 * 1. `account` where `providerId = 'discord'` — Better Auth already writes this
 *    for anyone who signed in with Discord, so those users are linked for free
 *    and never see a `/link` prompt.
 * 2. `discord_links` — the bot's own row, written when someone completes
 *    `/link` on the web. `account` belongs to Better Auth and it may rewrite it
 *    on an unlink or a provider change, so the bot keeps a row it can rely on.
 *
 * A miss is `userId: null`, not an error: the caller (a button click) turns that
 * into "link your account first", which is an action, not a failure.
 *
 * Nothing here creates a user. `users.email` is required, so an account made up
 * from a Discord id would carry a synthetic address Better Auth would then treat
 * as real — that is path C, and it is ruled out.
 */

/** No `I`, `O`, `0` or `1`: a code is read off one screen and typed on another. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Six characters, as DISC-06 specifies. */
export const LINK_CODE_LENGTH = 6;

/** Long enough to switch devices, short enough that a leaked code dies. */
export const LINK_CODE_TTL_SECONDS = 600;

const CODE_KEY_PREFIX = 'discord:link:code:';

/** A collision on a 32^6 keyspace is vanishingly rare; five tries is paranoia. */
const CODE_ATTEMPTS = 5;

/** How the bot would resolve a Discord account right now. */
export type LinkSource = 'account' | 'link' | 'none';

export interface ResolvedLink {
  /** Null when the Discord account has no IKnoBall user. */
  userId: string | null;
  /** Which branch answered. The bot does not need it; the web page explains itself with it. */
  source: LinkSource;
}

export interface IssuedLinkCode {
  code: string;
  expiresInSeconds: number;
}

export interface DiscordLinkStatus {
  /** The Discord id the bot would use for this account, whichever branch found it. */
  discordUserId: string | null;
  source: LinkSource;
  /**
   * True when Discord is also a sign-in method for this account. Disconnecting
   * the bot link then does *not* stop resolution — Better Auth's `account` row
   * still answers first — so the page has to say so rather than imply the click
   * path was closed.
   */
  signInMethod: boolean;
}

export interface RemovedLink {
  /** False when there was no `discord_links` row to delete. */
  removed: boolean;
  /** True when the bot still resolves this account through its Discord sign-in. */
  stillResolvable: boolean;
}

/** The Redis key one code lives under. Exported so a test can look it up. */
export function codeKey(code: string): string {
  return `${CODE_KEY_PREFIX}${normalizeCode(code)}`;
}

/** Codes are case-insensitive on the way in: nobody types `a` vs `A` on purpose. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** A fresh code, uniform over the 32-character alphabet. */
export function generateCode(): string {
  let code = '';
  for (let index = 0; index < LINK_CODE_LENGTH; index++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class DiscordLinkService {
  private readonly logger = new Logger(DiscordLinkService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * `discord id → userId`, `account` first and `discord_links` second.
   *
   * The `account` branch is the free one and the reason a Discord sign-in user
   * is recognised on their first click. It reads `account` by
   * `(provider_id, account_id)`, which has no index (only `account_userId_idx`
   * exists) — see the note in the C5 report; the schema chunk owns migrations.
   */
  async resolve(discordUserId: string): Promise<ResolvedLink> {
    const [signIn] = await this.database.db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordUserId)))
      .orderBy(account.createdAt)
      .limit(1);

    if (signIn) return { userId: signIn.userId, source: 'account' };

    const [link] = await this.database.db
      .select({ userId: discordLinks.userId })
      .from(discordLinks)
      .where(eq(discordLinks.discordUserId, discordUserId))
      .limit(1);

    if (link) return { userId: link.userId, source: 'link' };

    return { userId: null, source: 'none' };
  }

  /**
   * Mint a single-use code for one Discord account, in Redis, with a TTL.
   *
   * `SET ... NX EX` rather than a read-then-write: the write is what decides
   * whether the code is free, so two callers can never be handed the same one.
   * Redis rather than a table because a code is worthless after ten minutes and
   * nothing needs to query it later.
   */
  async issueCode(discordUserId: string): Promise<IssuedLinkCode> {
    const client = await this.redisClient();

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = generateCode();
      const stored = await client.set(codeKey(code), discordUserId, {
        EX: LINK_CODE_TTL_SECONDS,
        NX: true,
      });
      if (stored === 'OK') {
        return { code, expiresInSeconds: LINK_CODE_TTL_SECONDS };
      }
    }

    this.logger.error(`No free linking code after ${CODE_ATTEMPTS} attempts.`);
    throw new ServiceUnavailableException('Could not issue a linking code. Try again.');
  }

  /**
   * Spend a code and write the link for the session's user.
   *
   * The code is read and deleted in one `GETDEL`, so it is single-use even if
   * two browsers submit it at once — and it is spent *before* the conflict
   * checks below, because a code that failed for a reason the user must fix
   * anyway (another account holds that Discord id) should not stay live.
   *
   * Every conflict is a 409 with a message the page shows verbatim; the unique
   * constraints on `discord_links` are still the authority if two requests race
   * past these reads.
   */
  async consumeCode(rawCode: string, userId: string): Promise<{ discordUserId: string }> {
    const client = await this.redisClient();
    const discordUserId = await client.getDel(codeKey(rawCode));

    if (!discordUserId) {
      throw new BadRequestException(
        'That linking code is not valid or has expired. Run /link in Discord for a new one.',
      );
    }

    const db = this.database.db;

    const [byUser] = await db
      .select({ discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .where(eq(discordLinks.userId, userId))
      .limit(1);

    if (byUser) {
      // Re-submitting the code for the account it already belongs to is a no-op,
      // not an error: the page may be reloaded mid-flow.
      if (byUser.discordUserId === discordUserId) return { discordUserId };
      throw new ConflictException(
        'This IKnoBall account is already linked to a different Discord account. Disconnect that one first.',
      );
    }

    const [byDiscord] = await db
      .select({ userId: discordLinks.userId })
      .from(discordLinks)
      .where(eq(discordLinks.discordUserId, discordUserId))
      .limit(1);

    if (byDiscord) {
      throw new ConflictException(
        'That Discord account is already linked to another IKnoBall account.',
      );
    }

    // A Discord sign-in row for a different user outranks any link we could
    // write: `resolve` checks `account` first, so the row would be dead weight
    // and the user would be told they were linked while their clicks landed
    // somewhere else.
    const [signIn] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordUserId)))
      .orderBy(account.createdAt)
      .limit(1);

    if (signIn && signIn.userId !== userId) {
      throw new ConflictException(
        'That Discord account signs in to a different IKnoBall account, so it cannot be linked to this one.',
      );
    }

    try {
      await db.insert(discordLinks).values({ userId, discordUserId });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'That Discord account could not be linked: it or this account is already linked elsewhere.',
        );
      }
      throw error;
    }

    return { discordUserId };
  }

  /**
   * `/unlink`: delete the bot's own row for one Discord account.
   *
   * `stillResolvable` is the honest half of the answer. A Discord sign-in user
   * has no `discord_links` row to begin with, and deleting one does not remove
   * Better Auth's `account` row — so the bot must not tell them their clicks
   * stopped landing on the account when `resolve` would still find it.
   */
  async deleteLink(discordUserId: string): Promise<RemovedLink> {
    const [signIn] = await this.database.db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordUserId)))
      .limit(1);

    const removed = await this.database.db
      .delete(discordLinks)
      .where(eq(discordLinks.discordUserId, discordUserId))
      .returning({ id: discordLinks.id });

    return { removed: removed.length > 0, stillResolvable: Boolean(signIn) };
  }

  /** What the web page shows: which Discord account, found how, and via sign-in too? */
  async statusForUser(userId: string): Promise<DiscordLinkStatus> {
    const [link] = await this.database.db
      .select({ discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .where(eq(discordLinks.userId, userId))
      .limit(1);

    const [signIn] = await this.database.db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.userId, userId)))
      .orderBy(account.createdAt)
      .limit(1);

    return {
      discordUserId: link?.discordUserId ?? signIn?.accountId ?? null,
      // Mirrors `resolve`: a link row wins over the sign-in row only because the
      // sign-in row is checked first and this reports what is *stored*.
      source: link ? 'link' : signIn ? 'account' : 'none',
      signInMethod: Boolean(signIn),
    };
  }

  /**
   * Disconnect for the session's user.
   *
   * Only `discord_links` is touched. `account` is Better Auth's table: removing
   * the Discord sign-in method is `unlink-account` on the profile page, and doing
   * it from here would log a Discord user out of their own sign-in. Picks are
   * untouched by design — the link is identity, not history.
   */
  async deleteForUser(userId: string): Promise<RemovedLink> {
    const [signIn] = await this.database.db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.userId, userId)))
      .orderBy(account.createdAt)
      .limit(1);

    const [link] = await this.database.db
      .select({ discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .where(eq(discordLinks.userId, userId))
      .limit(1);

    if (!link) return { removed: false, stillResolvable: Boolean(signIn) };

    await this.database.db.delete(discordLinks).where(eq(discordLinks.userId, userId));

    // `account` still answers first for a Discord sign-in user, so the caller
    // must not claim the click path is closed.
    return { removed: true, stillResolvable: Boolean(signIn) };
  }

  /** `RedisModule` is global, but the connection is lazy: connect on first use. */
  private async redisClient() {
    if (!this.redis.isConnected()) await this.redis.connect();
    return this.redis.getClient();
  }
}

/** Postgres `23505` — unique violation, somewhere on the driver error's cause chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth++) {
    if (typeof current === 'object' && (current as { code?: unknown }).code === '23505') {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
