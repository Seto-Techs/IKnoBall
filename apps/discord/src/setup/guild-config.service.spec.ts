import { describe, expect, it } from 'vitest';
import type { Infrastructure } from '../scheduler/infrastructure';
import { GuildConfigService, type GuildSettings } from './guild-config.service';

/**
 * `discord_guilds` read/write, against a fake Drizzle client.
 *
 * The fake records what the service would write, which is enough to pin the rule
 * that matters: `/setup channel:#nba` must not reset an hour the admin chose, and
 * a reinstall must clear `leftAt` instead of starting over. The real SQL is
 * exercised by the chunk's live proof against Postgres.
 */

interface FakeDb {
  select: () => {
    from: () => {
      where: () => {
        limit: (count: number) => Promise<GuildSettings[]>;
        orderBy: () => Promise<GuildSettings[]>;
      };
    };
  };
  insert: () => {
    values: (values: Record<string, unknown>) => {
      onConflictDoUpdate: (options: unknown) => { returning: () => Promise<unknown[]> };
    };
  };
  update: () => {
    set: (values: Record<string, unknown>) => { where: (clause: unknown) => Promise<void> };
  };
}

function fakeDb(rows: GuildSettings[] = []) {
  const writes: {
    inserted?: Record<string, unknown>;
    conflict?: unknown;
    updated?: Record<string, unknown>;
  } = {};

  const db: FakeDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
          orderBy: async () => rows,
        }),
      }),
    }),
    insert: () => ({
      values: (values) => ({
        onConflictDoUpdate: (options) => {
          writes.inserted = values;
          writes.conflict = options;
          return { returning: async () => [values] };
        },
      }),
    }),
    update: () => ({
      set: (values) => ({
        where: async () => {
          writes.updated = values;
        },
      }),
    }),
  };

  return { db, writes };
}

function serviceFor(rows: GuildSettings[] = []) {
  const { db, writes } = fakeDb(rows);
  const service = new GuildConfigService({ db } as unknown as Infrastructure);
  return { service, writes };
}

function row(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    postHour: 14,
    timezone: 'Europe/London',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
    ...overrides,
  };
}

describe('reading a guild', () => {
  it('returns the row', async () => {
    const { service } = serviceFor([row()]);
    expect(await service.get('guild-1')).toEqual(row());
  });

  it('returns null for a guild that has never run /setup', async () => {
    const { service } = serviceFor([]);
    expect(await service.get('guild-1')).toBeNull();
  });
});

describe('writing a guild', () => {
  it('defaults to 9 a.m. New York when the admin says nothing', async () => {
    const { service, writes } = serviceFor([]);

    await service.save({ guildId: 'guild-1', channelId: 'channel-1' });

    expect(writes.inserted).toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      postHour: 9,
      timezone: 'America/New_York',
      enabled: true,
      leftAt: null,
    });
  });

  it('keeps the hour and zone when only the channel is respecified', async () => {
    const { service, writes } = serviceFor([row()]);

    await service.save({ guildId: 'guild-1', channelId: 'channel-2' });

    expect(writes.inserted).toMatchObject({
      channelId: 'channel-2',
      postHour: 14,
      timezone: 'Europe/London',
      installedAt: new Date('2026-10-01T00:00:00.000Z'),
    });
  });

  it('writes what the admin asked for', async () => {
    const { service, writes } = serviceFor([row()]);

    await service.save({
      guildId: 'guild-1',
      channelId: 'channel-3',
      postHour: 7,
      timezone: 'Australia/Sydney',
    });

    expect(writes.inserted).toMatchObject({
      channelId: 'channel-3',
      postHour: 7,
      timezone: 'Australia/Sydney',
    });
    expect(writes.conflict).toBeDefined();
  });

  it('re-enables and un-leaves a guild on setup', async () => {
    const { service, writes } = serviceFor([row({ enabled: false, leftAt: new Date() })]);

    await service.save({ guildId: 'guild-1', channelId: 'channel-1' });

    expect(writes.inserted).toMatchObject({ enabled: true, leftAt: null });
  });

  it('returns the row it wrote', async () => {
    const { service } = serviceFor([]);
    const saved = await service.save({ guildId: 'guild-1', channelId: 'channel-1' });
    expect(saved).toMatchObject({ guildId: 'guild-1', channelId: 'channel-1', postHour: 9 });
  });
});

describe('guild lifecycle', () => {
  it('stamps leftAt on removal and keeps the config', async () => {
    const { service, writes } = serviceFor([row()]);

    await service.markLeft('guild-1');

    expect(writes.updated).toMatchObject({ leftAt: expect.any(Date) });
    expect(writes.updated).not.toHaveProperty('channelId');
    expect(writes.updated).not.toHaveProperty('postHour');
  });

  it('clears leftAt on a reinstall', async () => {
    const { service, writes } = serviceFor([row({ leftAt: new Date('2026-10-20T00:00:00.000Z') })]);

    await service.markRejoined('guild-1');

    expect(writes.updated).toEqual({ leftAt: null });
  });
});

describe('the scheduler’s guild list', () => {
  it('asks the table for its rows', async () => {
    const { service } = serviceFor([row(), row({ guildId: 'guild-2' })]);
    expect(await service.listEnabled()).toHaveLength(2);
  });
});

describe('errors', () => {
  it('propagates a failed write instead of pretending it saved', async () => {
    const failing = new GuildConfigService({
      db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => ({
              returning: async () => {
                throw new Error('connection terminated');
              },
            }),
          }),
        }),
      },
    } as unknown as Infrastructure);

    await expect(failing.save({ guildId: 'guild-1', channelId: 'channel-1' })).rejects.toThrow(
      'connection terminated',
    );
  });

  it('never swallows a removal failure', async () => {
    const service = new GuildConfigService({
      db: {
        update: () => ({
          set: () => ({
            where: async () => {
              throw new Error('connection terminated');
            },
          }),
        }),
      },
    } as unknown as Infrastructure);

    await expect(service.markLeft('guild-1')).rejects.toThrow('connection terminated');
  });
});
