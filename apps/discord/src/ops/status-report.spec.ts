import { describe, expect, it } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import { DiscordConfigService } from '../config/discord-config.service';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { collectStatus, formatStatus, type StatusReport } from './status-report';

/**
 * `/status`: every number is read live, so every number is checked here against the
 * source it claims — the gateway's cache, two SQL aggregates, and the rate limiter.
 */

/**
 * The two aggregates `collectStatus` runs, resolved in call order.
 *
 * Drizzle's builder is thenable, so `from()` has to hand back something `await`
 * accepts; `where()` returns itself so the guild query can be written the normal
 * way. The two selects are told apart by their shape, not by call order, so a
 * reordering in `status-report.ts` does not silently feed one result to the other.
 */
function fakeDatabase(rows: { guilds: unknown[]; cards: unknown[] }): unknown {
  const chain = (result: unknown) => {
    const promise = Promise.resolve(result);
    const node = {
      where: () => node,
      then: (resolve: unknown, reject: unknown) => promise.then(resolve, reject),
    };
    return node;
  };

  return {
    db: {
      select: (shape: Record<string, unknown>) => ({
        from: () => chain('configured' in shape ? rows.guilds : rows.cards),
      }),
    },
  };
}

interface Harness {
  moduleRef: ModuleRef;
  client: { isReady: () => boolean; guilds: { cache: { size: number } } };
}

function harness(options: {
  enabled?: boolean;
  ready?: boolean;
  guildCount?: number;
  guilds?: unknown[];
  cards?: unknown[];
  limiter?: Record<string, unknown>;
}): Harness {
  const client = {
    isReady: () => options.ready ?? true,
    guilds: { cache: { size: options.guildCount ?? 0 } },
  };

  const providers = new Map<unknown, unknown>([
    [DiscordConfigService, { enabled: options.enabled ?? true }],
    [DatabaseService, fakeDatabase({ guilds: options.guilds ?? [], cards: options.cards ?? [] })],
    [DiscordClientService, { client }],
    [RateLimiter, options.limiter ?? {}],
  ]);

  return {
    client,
    moduleRef: {
      get: (token: unknown) => {
        if (!providers.has(token)) throw new Error(`unexpected provider: ${String(token)}`);
        return providers.get(token);
      },
    } as unknown as ModuleRef,
  };
}

describe('collectStatus', () => {
  it('reads every number from its own source', async () => {
    const lastPostAt = new Date('2026-10-27T13:00:00.000Z');
    const { moduleRef } = harness({
      guildCount: 12,
      guilds: [{ configured: '3' }],
      // pg hands `count()` back as a bigint string; `max()` as a Date.
      cards: [{ posted: '40', locked: '31', settled: '22', lastPostAt }],
      limiter: { depth: () => 7 },
    });

    expect(await collectStatus(moduleRef)).toEqual({
      enabled: true,
      guilds: 12,
      guildsConfigured: 3,
      lastPostAt,
      cards: { posted: 40, locked: 31, settled: 22 },
      queueDepth: 7,
    });
  });

  it('reports the gateway as unknown rather than zero while the client is not ready', async () => {
    const { moduleRef } = harness({ ready: false, guildCount: 12 });

    const report = await collectStatus(moduleRef);

    expect(report.guilds).toBeNull();
  });

  it('reports an empty database as zeros and "never" posted', async () => {
    const { moduleRef } = harness({ guilds: [{ configured: '0' }], cards: [{ posted: '0' }] });

    const report = await collectStatus(moduleRef);

    expect(report).toMatchObject({
      guildsConfigured: 0,
      lastPostAt: null,
      cards: { posted: 0, locked: 0, settled: 0 },
    });
  });

  it('reports the queue as unknown when the limiter has no depth()', async () => {
    // DISC-12 added `depth()`; a build without it (a half-deployed or older image)
    // must say "unknown", not a reassuring 0.
    const { moduleRef } = harness({ limiter: {} });

    expect((await collectStatus(moduleRef)).queueDepth).toBeNull();
  });

  it('reports the kill switch as it is, not as it should be', async () => {
    const { moduleRef } = harness({ enabled: false });

    expect((await collectStatus(moduleRef)).enabled).toBe(false);
  });
});

describe('formatStatus', () => {
  const healthy: StatusReport = {
    enabled: true,
    guilds: 12,
    guildsConfigured: 12,
    lastPostAt: new Date('2026-10-27T13:00:00.000Z'),
    cards: { posted: 40, locked: 31, settled: 22 },
    queueDepth: 3,
  };

  it('prints each number on its own line', () => {
    const text = formatStatus(healthy);

    expect(text).toContain('active');
    expect(text).toContain('guilds: **12** connected · **12** configured');
    expect(text).toContain('cards: **40** posted · **31** locked · **22** settled');
    expect(text).toContain('queue: 3 waiting');
    // Discord renders `<t:…:R>` in the reader's timezone; 13:00Z is 1793106000.
    expect(text).toContain('<t:1793106000:R>');
    expect(text).toContain('<t:1793106000:f>');
  });

  it('says "never" when no card has ever been posted', () => {
    expect(formatStatus({ ...healthy, lastPostAt: null })).toContain('last slate post: never');
  });

  it('says "unknown" for the queue when the limiter cannot report a depth', () => {
    const text = formatStatus({ ...healthy, queueDepth: null });

    expect(text).toContain('queue: unknown');
    expect(text).not.toContain('queue: 0');
  });

  it('banners the kill switch, and says what it stops', () => {
    const text = formatStatus({ ...healthy, enabled: false });

    expect(text).toContain('paused (`DISCORD_ENABLED=false`)');
    expect(text).toContain('Posting, locks and settlement edits are off');
  });

  it('shows a dash for guilds while the gateway is not ready', () => {
    expect(formatStatus({ ...healthy, guilds: null })).toContain('guilds: **—** connected');
  });
});
