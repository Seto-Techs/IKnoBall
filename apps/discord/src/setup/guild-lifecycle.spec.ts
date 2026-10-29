import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { Events, type Client, type Guild } from 'discord.js';
import type { Infrastructure } from '../scheduler/infrastructure';
import { GuildConfigService } from './guild-config.service';
import { GuildLifecycle, SETUP_HINT } from './guild-lifecycle';

/**
 * Joining and leaving a server.
 *
 * Two behaviours: the row survives a removal, and a join never guesses a channel.
 * Every failure path here is one Discord produces routinely — a closed DM, an
 * owner the bot cannot fetch — and none of them may reject into the gateway.
 */

function harness(options: { dbDown?: boolean; client?: Client } = {}) {
  const markRejoined = vi.fn(async () => {
    if (options.dbDown) throw new Error('connection terminated');
  });
  const markLeft = vi.fn(async () => {
    if (options.dbDown) throw new Error('connection terminated');
  });

  const client = options.client ?? (new EventEmitter() as unknown as Client);
  const lifecycle = new GuildLifecycle(
    { client } as unknown as Infrastructure,
    {
      markRejoined,
      markLeft,
    } as unknown as GuildConfigService,
  );

  return { lifecycle, markRejoined, markLeft };
}

function fakeGuild(id = 'guild-1', options: { dmClosed?: boolean; ownerMissing?: boolean } = {}) {
  const send = vi.fn(async () => {
    if (options.dmClosed) throw new Error('Cannot send messages to this user');
    return {};
  });

  const guild = {
    id,
    send,
    fetchOwner: vi.fn(async () => {
      if (options.ownerMissing) throw new Error('Unknown Guild');
      return { send };
    }),
  };

  return guild;
}

/** Let the `void this.onJoin(...)` promise chain finish. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('guildCreate', () => {
  it('DMs the owner the one-line setup hint', async () => {
    const { lifecycle, markRejoined } = harness();
    const guild = fakeGuild();

    await lifecycle.onJoin(guild);

    expect(markRejoined).toHaveBeenCalledWith('guild-1');
    expect(guild.fetchOwner).toHaveBeenCalledTimes(1);
    expect(guild.send).toHaveBeenCalledTimes(1);
    expect(guild.send).toHaveBeenCalledWith({ content: SETUP_HINT });
    expect(SETUP_HINT).toContain('/setup');
    expect(SETUP_HINT.split('\n')).toHaveLength(1);
  });

  it('does not throw when the owner has DMs closed', async () => {
    const { lifecycle } = harness();
    const guild = fakeGuild('guild-1', { dmClosed: true });

    await expect(lifecycle.onJoin(guild)).resolves.toBeUndefined();
    expect(guild.send).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the owner cannot be fetched', async () => {
    const { lifecycle } = harness();
    const guild = fakeGuild('guild-1', { ownerMissing: true });

    await expect(lifecycle.onJoin(guild)).resolves.toBeUndefined();
    expect(guild.send).not.toHaveBeenCalled();
  });

  it('still welcomes the owner when the database write fails', async () => {
    const { lifecycle, markRejoined } = harness({ dbDown: true });
    const guild = fakeGuild();

    await expect(lifecycle.onJoin(guild)).resolves.toBeUndefined();
    expect(markRejoined).toHaveBeenCalledTimes(1);
    expect(guild.send).toHaveBeenCalledTimes(1);
  });
});

describe('guildDelete', () => {
  it('marks the row as left instead of deleting it', async () => {
    const { lifecycle, markLeft } = harness();

    await lifecycle.onLeave({ id: 'guild-1' });

    expect(markLeft).toHaveBeenCalledWith('guild-1');
  });

  it('does not throw into the gateway when the write fails', async () => {
    const { lifecycle } = harness({ dbDown: true });

    await expect(lifecycle.onLeave({ id: 'guild-1' })).resolves.toBeUndefined();
  });
});

describe('the gateway wiring', () => {
  it('answers both lifecycle events', async () => {
    const { lifecycle, markRejoined, markLeft } = harness();
    const client = new EventEmitter() as unknown as Client;

    lifecycle.register(client);

    const guild = fakeGuild();
    client.emit(Events.GuildCreate, guild as unknown as Guild);
    client.emit(Events.GuildDelete, { id: 'guild-2' } as unknown as Guild);
    await flush();

    expect(markRejoined).toHaveBeenCalledWith('guild-1');
    expect(markLeft).toHaveBeenCalledWith('guild-2');
    expect(guild.send).toHaveBeenCalledTimes(1);
  });

  it('binds on boot, from the trunk client', () => {
    const client = new EventEmitter() as unknown as Client;
    const { lifecycle } = harness({ client });
    const register = vi.spyOn(lifecycle, 'register');

    lifecycle.onApplicationBootstrap();

    expect(register).toHaveBeenCalledWith(client);
  });
});
