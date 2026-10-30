import type { discordMembers } from '@iknoball/database';

/**
 * The mirror's vocabulary.
 *
 * `DiscordMemberRow` is the real schema's insert type, so a fake store in a test
 * is checked against the columns the table actually has rather than against a
 * shape invented here.
 */
export type DiscordMemberRow = typeof discordMembers.$inferInsert;

/**
 * What the sync needs from the database.
 *
 * An abstract class rather than an interface so it can be the injection token as
 * well as the type: the sync is tested against an in-memory map, because its job
 * is "which rows does this event produce", while the repository's job is the SQL
 * that lands them.
 */
export abstract class MembersStore {
  /** Idempotent on `(guildId, discordUserId)`; an empty array is a no-op. */
  abstract upsert(rows: DiscordMemberRow[]): Promise<void>;
  abstract remove(guildId: string, discordUserId: string): Promise<void>;
  /** Everything for one guild, for when the bot is removed from it. */
  abstract removeGuild(guildId: string): Promise<void>;
}

/**
 * The part of a `GuildMember` the mirror reads.
 *
 * Structural on purpose: the real `GuildMember` satisfies it, and a test can pass
 * a two-field object instead of standing up a gateway.
 */
export interface MirrorMember {
  readonly id: string;
  readonly displayName: string;
  readonly joinedAt: Date | null;
  /** Bot accounts are skipped: they can never hold an IKnoBall account. */
  readonly user: { readonly bot: boolean };
}

/** A member with the guild it belongs to, as the member events deliver it. */
export interface MirrorGuildMember extends MirrorMember {
  readonly guild: { readonly id: string };
}

/**
 * The part of a `Guild` the mirror reads.
 *
 * `list()` rather than `fetch()`: `fetch()` resolves with the whole member list
 * as one Collection, which on a 100k-member guild is a 100k-entry object held
 * long enough to be a problem. `list()` is the same REST route with `limit` and
 * `after`, so the sync can mirror a page and drop it. discord.js pages internally
 * for `fetch()`; this pages explicitly so nothing accumulates.
 */
export interface MirrorGuild {
  readonly id: string;
  readonly members: {
    list(options: { limit: number; after?: string }): Promise<ReadonlyMap<string, MirrorMember>>;
  };
}
