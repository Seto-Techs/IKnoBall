import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Events, type Client } from 'discord.js';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { MembersStore } from './members.types';
import type {
  DiscordMemberRow,
  MirrorGuild,
  MirrorGuildMember,
  MirrorMember,
} from './members.types';

/**
 * Members per `list()` page.
 *
 * Discord's own maximum for `GET /guilds/{id}/members`, so this is the fewest
 * round trips a full mirror can take.
 */
export const MEMBER_PAGE_SIZE = 1000;

/**
 * The membership mirror, which is what makes the per-server leaderboard possible.
 *
 * Definition B ranks everyone *in* a server, so "is this person in this server"
 * has to be answerable locally: a pick carries a `userId`, the mirror maps Discord
 * users to guilds, and the board joins the two. Asking Discord per render would be
 * a paginated REST call on every `/leaderboard`, which is why the list is copied
 * here instead.
 *
 * Refreshed in two ways. On `ClientReady` and `guildCreate` a guild's whole member
 * list is read back; in between, `guildMemberAdd`, `guildMemberRemove`, and
 * `guildMemberUpdate` keep it current. A member who leaves loses their row and so
 * drops off the board until they rejoin — the mirror is "who is here now", not a
 * history.
 *
 * Every failure is per guild and per event: one guild the bot cannot read must not
 * stop the others from being mirrored, and a gateway event must never reject into
 * discord.js.
 */
@Injectable()
export class MembersSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(MembersSync.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly store: MembersStore,
  ) {}

  /**
   * Bind the gateway listeners.
   *
   * `DiscordClientService` is a provider of `AppModule`, which imports this module
   * rather than the other way round, so it is resolved from the whole graph — the
   * same `{ strict: false }` lookup `InteractionRouter` uses. The client already
   * exists here: `main.ts` logs in only after the application context is ready,
   * which is after this hook.
   */
  onApplicationBootstrap(): void {
    this.register(this.moduleRef.get(DiscordClientService, { strict: false }).client);
  }

  /** Wire the six events the mirror cares about. Separated for tests. */
  register(client: Client): void {
    client.on(Events.ClientReady, (ready) => {
      void this.attempt('initial sync', () => this.syncAll(ready.guilds.cache.values()));
    });

    client.on(Events.GuildCreate, (guild) => {
      void this.attempt(`guild ${guild.id} join sync`, () => this.syncGuild(guild));
    });

    client.on(Events.GuildDelete, (guild) => {
      void this.attempt(`guild ${guild.id} delete`, () => this.forgetGuild(guild.id));
    });

    client.on(Events.GuildMemberAdd, (member) => {
      void this.attempt(`guild ${member.guild.id} member add`, () => this.addMember(member));
    });

    client.on(Events.GuildMemberRemove, (member) => {
      void this.attempt(`guild ${member.guild.id} member remove`, () => this.removeMember(member));
    });

    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      // A member update fires for roles, boosts, and timeouts too; only the name
      // is mirrored, so nothing else is worth a write.
      if (oldMember.displayName === newMember.displayName) return;
      void this.attempt(`guild ${newMember.guild.id} member update`, () =>
        this.addMember(newMember),
      );
    });
  }

  /**
   * Mirror every guild the bot is in, one at a time.
   *
   * Sequential rather than concurrent: each guild is a burst of paginated REST
   * calls, and running a hundred of them at once is how a rate limiter turns a
   * boot into a ban. A guild that fails is logged and skipped.
   */
  async syncAll(guilds: Iterable<MirrorGuild>): Promise<void> {
    const failed: string[] = [];

    for (const guild of guilds) {
      const ok = await this.syncGuild(guild);
      if (!ok) failed.push(guild.id);
    }

    if (failed.length > 0) {
      this.logger.warn(
        `Member mirror: ${failed.length} guild(s) could not be read: ${failed.join(', ')}`,
      );
    }
  }

  /**
   * Read one guild's member list, page by page.
   *
   * Each page is upserted and then dropped, so peak memory is one page rather than
   * one guild: a 100k-member server never exists as a 100k-entry object here.
   * Returns false when the read failed, so `syncAll` can name the guild without
   * this method throwing into a gateway listener.
   */
  async syncGuild(guild: MirrorGuild): Promise<boolean> {
    let after: string | undefined;
    let mirrored = 0;

    try {
      for (;;) {
        const page = await guild.members.list({ limit: MEMBER_PAGE_SIZE, after });
        const rows = toRows(guild.id, page.values());

        await this.store.upsert(rows);
        mirrored += rows.length;

        if (page.size < MEMBER_PAGE_SIZE) break;

        const last = [...page.keys()].at(-1);
        // A full page that does not advance would loop forever; Discord always
        // returns the highest id last, so this only trips on a broken response.
        if (!last || last === after) break;
        after = last;
      }
    } catch (error) {
      this.logger.error(
        `Member mirror: could not read the member list of guild ${guild.id}: ${describe(error)}`,
      );
      return false;
    }

    this.logger.log(`Member mirror: guild ${guild.id}: ${mirrored} member(s) mirrored.`);
    return true;
  }

  /** A member joined: one row, idempotent if they were already mirrored. */
  async addMember(member: MirrorGuildMember): Promise<void> {
    await this.store.upsert(toRows(member.guild.id, [member]));
  }

  /** A member left: their row goes, so they leave the board with it. */
  async removeMember(member: Pick<MirrorGuildMember, 'id' | 'guild'>): Promise<void> {
    await this.store.remove(member.guild.id, member.id);
  }

  /** The bot was removed from a guild: nothing in the mirror is reachable any more. */
  async forgetGuild(guildId: string): Promise<void> {
    await this.store.removeGuild(guildId);
    this.logger.log(`Member mirror: guild ${guildId}: membership rows deleted.`);
  }

  /** Run one unit of work, logging instead of rejecting into discord.js. */
  private async attempt(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Member mirror: ${what} failed: ${describe(error)}`);
    }
  }
}

/**
 * Members to rows.
 *
 * Bot accounts are skipped: they cannot hold an IKnoBall account, so their rows
 * could never appear on a board and would only make the mirror bigger than the
 * thing it mirrors.
 */
function toRows(guildId: string, members: Iterable<MirrorMember>): DiscordMemberRow[] {
  const rows: DiscordMemberRow[] = [];

  for (const member of members) {
    if (member.user.bot) continue;
    rows.push({
      guildId,
      discordUserId: member.id,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
    });
  }

  return rows;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
