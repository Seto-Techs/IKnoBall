import { describe, expect, it } from 'vitest';
import { Events, type Client } from 'discord.js';
import { MembersSync, MEMBER_PAGE_SIZE } from './members.sync';
import {
  MembersStore,
  type DiscordMemberRow,
  type MirrorGuild,
  type MirrorGuildMember,
  type MirrorMember,
} from './members.types';
import type { ModuleRef } from '@nestjs/core';

/**
 * The mirror, against a fake gateway and an in-memory store.
 *
 * What is worth proving here is which row each event produces: a join upserts, a
 * leave deletes, a rename rewrites, a removed guild disappears, and one guild
 * Discord will not let us read does not stop the next one. The SQL those rows
 * land in is `MembersRepository`'s job and is exercised against the real database
 * by the chunk's live proof.
 */

/** Members of one fake guild, paged the way Discord pages `list()`. */
function fakeGuild(
  id: string,
  members: MirrorMember[],
  options: { fail?: boolean } = {},
): MirrorGuild & { listCalls: { limit: number; after?: string }[] } {
  const listCalls: { limit: number; after?: string }[] = [];

  return {
    id,
    listCalls,
    members: {
      list: async ({ limit, after }) => {
        listCalls.push({ limit, after });
        if (options.fail) throw new Error('Missing Access');

        const ordered = [...members]
          .sort((left, right) => left.id.localeCompare(right.id))
          .filter((member) => (after === undefined ? true : member.id > after));

        const page = new Map<string, MirrorMember>();
        for (const member of ordered.slice(0, limit)) page.set(member.id, member);
        return page;
      },
    },
  };
}

function member(
  id: string,
  displayName: string,
  options: { bot?: boolean; guildId?: string; joinedAt?: Date | null } = {},
): MirrorGuildMember {
  return {
    id,
    displayName,
    joinedAt:
      options.joinedAt === undefined ? new Date('2026-10-01T12:00:00.000Z') : options.joinedAt,
    user: { bot: options.bot ?? false },
    guild: { id: options.guildId ?? 'guild-1' },
  };
}

/** `discord_members` as a map, keyed the way the table's primary key is. */
class FakeStore extends MembersStore {
  readonly rows = new Map<string, DiscordMemberRow>();
  upsertCalls = 0;

  async upsert(rows: DiscordMemberRow[]): Promise<void> {
    this.upsertCalls++;
    for (const row of rows) this.rows.set(key(row.guildId, row.discordUserId), row);
  }

  async remove(guildId: string, discordUserId: string): Promise<void> {
    this.rows.delete(key(guildId, discordUserId));
  }

  async removeGuild(guildId: string): Promise<void> {
    for (const rowKey of [...this.rows.keys()]) {
      if (rowKey.startsWith(`${guildId}|`)) this.rows.delete(rowKey);
    }
  }

  get(guildId: string, discordUserId: string): DiscordMemberRow | undefined {
    return this.rows.get(key(guildId, discordUserId));
  }

  /** Every mirrored row as `guild|user`, sorted, for whole-table assertions. */
  keys(): string[] {
    return [...this.rows.keys()].sort();
  }
}

function key(guildId: string, discordUserId: string): string {
  return `${guildId}|${discordUserId}`;
}

/** A client with just enough surface for `register()`. */
class FakeClient {
  readonly guilds = { cache: new Map<string, MirrorGuild>() };
  private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  on(event: string, listener: (...args: never[]) => void): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as (...args: unknown[]) => void);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

/** Let the fire-and-forget event handlers finish. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function build(store = new FakeStore()) {
  // `ModuleRef` is only used by `onApplicationBootstrap`, which these tests do not
  // run: they call `register()` with the client directly.
  const sync = new MembersSync({} as ModuleRef, store);
  return { sync, store };
}

describe('MembersSync', () => {
  it('mirrors every cached guild when the client becomes ready', async () => {
    const { sync, store } = build();
    const client = new FakeClient();
    client.guilds.cache.set('guild-1', fakeGuild('guild-1', [member('u1', 'Finny')]));
    client.guilds.cache.set(
      'guild-2',
      fakeGuild('guild-2', [member('u1', 'Finny', { guildId: 'guild-2' })]),
    );

    sync.register(client as unknown as Client);
    client.emit(Events.ClientReady, { guilds: client.guilds });
    await flush();

    expect(store.keys()).toEqual(['guild-1|u1', 'guild-2|u1']);
    expect(store.get('guild-1', 'u1')).toMatchObject({
      guildId: 'guild-1',
      discordUserId: 'u1',
      displayName: 'Finny',
      joinedAt: new Date('2026-10-01T12:00:00.000Z'),
    });
  });

  it('mirrors a guild the bot is added to', async () => {
    const { sync, store } = build();
    const client = new FakeClient();
    sync.register(client as unknown as Client);

    client.emit(
      Events.GuildCreate,
      fakeGuild('guild-9', [member('u7', 'Raka', { guildId: 'guild-9' })]),
    );
    await flush();

    expect(store.keys()).toEqual(['guild-9|u7']);
  });

  it('upserts a member on join, and a repeat join leaves one row', async () => {
    const { sync, store } = build();

    await sync.addMember(member('u2', 'Gangsit'));
    await sync.addMember(member('u2', 'Gangsit'));

    expect(store.keys()).toEqual(['guild-1|u2']);
    expect(store.upsertCalls).toBe(2);
  });

  it('deletes the row when a member leaves, and only that row', async () => {
    const { sync, store } = build();
    await sync.addMember(member('u2', 'Gangsit'));
    await sync.addMember(member('u3', 'Raka'));

    await sync.removeMember(member('u2', 'Gangsit'));

    expect(store.keys()).toEqual(['guild-1|u3']);
  });

  it('rewrites the display name when a member is renamed', async () => {
    const { sync, store } = build();
    const client = new FakeClient();
    await sync.addMember(member('u2', 'old name'));
    sync.register(client as unknown as Client);

    client.emit(Events.GuildMemberUpdate, member('u2', 'old name'), member('u2', 'new name'));
    await flush();

    expect(store.get('guild-1', 'u2')?.displayName).toBe('new name');
  });

  it('does not write when a member update changed something other than the name', async () => {
    const { sync, store } = build();
    const client = new FakeClient();
    await sync.addMember(member('u2', 'same name'));
    const writesAfterJoin = store.upsertCalls;
    sync.register(client as unknown as Client);

    client.emit(Events.GuildMemberUpdate, member('u2', 'same name'), member('u2', 'same name'));
    await flush();

    expect(store.upsertCalls).toBe(writesAfterJoin);
  });

  it('deletes a guild row when the bot is removed from that guild', async () => {
    const { sync, store } = build();
    const client = new FakeClient();
    await sync.addMember(member('u2', 'Gangsit'));
    await sync.addMember(member('u3', 'Raka', { guildId: 'guild-2' }));
    sync.register(client as unknown as Client);

    client.emit(Events.GuildDelete, { id: 'guild-1' });
    await flush();

    expect(store.keys()).toEqual(['guild-2|u3']);
  });

  it('keeps mirroring the other guilds when one member list cannot be read', async () => {
    const { sync, store } = build();
    const failing = fakeGuild('guild-bad', [member('u1', 'Finny', { guildId: 'guild-bad' })], {
      fail: true,
    });
    const healthy = fakeGuild('guild-good', [member('u2', 'Raka', { guildId: 'guild-good' })]);

    await sync.syncAll([failing, healthy]);

    expect(store.keys()).toEqual(['guild-good|u2']);
  });

  it('pages through a guild larger than one page without holding it whole', async () => {
    const { sync, store } = build();
    const members = Array.from({ length: MEMBER_PAGE_SIZE + 1 }, (_, index) =>
      member(`u${String(index).padStart(5, '0')}`, `member ${index}`, { guildId: 'guild-big' }),
    );
    const guild = fakeGuild('guild-big', members);

    const ok = await sync.syncGuild(guild);

    expect(ok).toBe(true);
    expect(guild.listCalls).toEqual([
      { limit: MEMBER_PAGE_SIZE, after: undefined },
      { limit: MEMBER_PAGE_SIZE, after: `u${String(MEMBER_PAGE_SIZE - 1).padStart(5, '0')}` },
    ]);
    expect(store.rows.size).toBe(MEMBER_PAGE_SIZE + 1);
  });

  it('skips bot accounts, which can never hold an IKnoBall account', async () => {
    const { sync, store } = build();

    await sync.addMember(member('bot-1', 'IKnoBall', { bot: true }));
    await sync.addMember(member('u2', 'Raka'));

    expect(store.keys()).toEqual(['guild-1|u2']);
  });

  it('swallows a store failure during a member event instead of rejecting into discord.js', async () => {
    let attempts = 0;
    const failing = new (class extends MembersStore {
      async upsert(): Promise<void> {
        attempts++;
        throw new Error('ECONNREFUSED');
      }
      async remove(): Promise<void> {}
      async removeGuild(): Promise<void> {}
    })();
    const sync = new MembersSync({} as ModuleRef, failing);
    const client = new FakeClient();
    sync.register(client as unknown as Client);

    client.emit(Events.GuildMemberAdd, member('u4', 'Finny'));
    await flush();

    // The handler ran and its rejection was caught: an unhandled rejection here
    // would have taken the process down with it.
    expect(attempts).toBe(1);
  });
});
