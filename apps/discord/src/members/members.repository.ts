import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';
import { discordMembers } from '@iknoball/database';
import { DatabaseService } from '../infrastructure/database.service';
import type { DiscordMemberRow, MembersStore } from './members.types';

/**
 * The SQL half of the membership mirror.
 *
 * Every write is idempotent on the composite primary key `(guildId,
 * discordUserId)`: the same person seen twice — a re-sync on reconnect, a member
 * update, a join for someone already mirrored — overwrites the row instead of
 * duplicating it. That is what lets the sync re-read a whole guild on every boot
 * without any bookkeeping about what it has already stored.
 */
@Injectable()
export class MembersRepository implements MembersStore {
  /**
   * `DatabaseService` is a provider of `AppModule`, which imports this module
   * rather than the other way round, so it is resolved from the whole graph —
   * the same `{ strict: false }` lookup `InteractionRouter` uses. Resolved
   * lazily, on first write, because `AppModule`'s own providers are instantiated
   * after the modules it imports.
   */
  constructor(private readonly moduleRef: ModuleRef) {}

  private get database(): DatabaseService {
    return this.moduleRef.get(DatabaseService, { strict: false });
  }

  /**
   * One statement per page of members.
   *
   * A page is at most `MEMBER_PAGE_SIZE` rows, so the parameter count stays well
   * under Postgres's 65,535 limit and a large guild costs one round trip per
   * thousand members rather than one per member.
   */
  async upsert(rows: DiscordMemberRow[]): Promise<void> {
    if (rows.length === 0) return;

    await this.database.db
      .insert(discordMembers)
      .values(rows)
      .onConflictDoUpdate({
        target: [discordMembers.guildId, discordMembers.discordUserId],
        set: {
          displayName: sql`excluded."displayName"`,
          joinedAt: sql`excluded."joinedAt"`,
          updatedAt: new Date(),
        },
      });
  }

  async remove(guildId: string, discordUserId: string): Promise<void> {
    await this.database.db
      .delete(discordMembers)
      .where(
        and(eq(discordMembers.guildId, guildId), eq(discordMembers.discordUserId, discordUserId)),
      );
  }

  async removeGuild(guildId: string): Promise<void> {
    await this.database.db.delete(discordMembers).where(eq(discordMembers.guildId, guildId));
  }
}
