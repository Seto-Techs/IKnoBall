import { describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import type { Interaction } from 'discord.js';
import { DiscordConfigService } from '../config/discord-config.service';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { CardSweep } from '../lock/card-sweep';
import { LockSweepService } from '../lock/lock-sweep.service';
import { SlateScheduler } from '../scheduler/slate-scheduler';
import type { GuildConfigService, GuildSettings } from '../setup/guild-config.service';
import type { DayKeyGuard } from '../scheduler/day-key.guard';
import type { PostResult, SlatePoster } from '../scheduler/slate-poster';
import { SettlementSweepService } from '../settlement/settlement-sweep.service';
import { interactionLog } from './interaction-log';
import { PAUSED_REPLY, paused, refusePaused, type PausedInteraction } from './kill-switch';

/**
 * `DISCORD_ENABLED=false` has to *stop* the bot, so each of the three things it
 * stops is asserted against the code that would otherwise do it: the slate cron,
 * the two card sweeps, and a pick click.
 */

function settings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    postHour: 9,
    timezone: 'America/New_York',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
    ...overrides,
  };
}

function posted(overrides: Partial<PostResult> = {}): PostResult {
  return {
    status: 'posted',
    etKey: '2026-10-27',
    games: 2,
    messageIds: ['message-1'],
    threadId: null,
    ...overrides,
  };
}

/** 9 a.m. in New York on 27 October 2026 — the hour the guild posts at. */
const NINE_ET = new Date('2026-10-27T13:00:00.000Z');

function scheduler(enabled: boolean) {
  const post = vi.fn(async () => posted());
  const listEnabled = vi.fn(async () => [settings()]);

  const instance = new SlateScheduler(
    { enabled } as unknown as DiscordConfigService,
    { listEnabled } as unknown as GuildConfigService,
    { post } as unknown as SlatePoster,
    { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
  );

  return { instance, post, listEnabled };
}

/**
 * A `ModuleRef` that answers with the four providers a sweep resolves, so the
 * services can be built without Nest and without a database.
 */
function moduleRef(enabled: boolean): ModuleRef {
  const providers = new Map<unknown, unknown>([
    [DiscordConfigService, { enabled }],
    [DatabaseService, { db: {} }],
    [DiscordClientService, { client: {} }],
    [RateLimiter, { schedule: async (task: () => Promise<unknown>) => task() }],
  ]);

  return {
    get: (token: unknown) => {
      if (!providers.has(token)) throw new Error(`unexpected provider: ${String(token)}`);
      return providers.get(token);
    },
  } as unknown as ModuleRef;
}

describe('paused', () => {
  it('is the negation of the flag the config service already reads', () => {
    expect(paused({ enabled: true })).toBe(false);
    expect(paused({ enabled: false })).toBe(true);
  });
});

describe('the switch stops the slate post', () => {
  it('posts nothing, and does not even ask which guilds are due', async () => {
    const { instance, post, listEnabled } = scheduler(false);

    expect(await instance.tick(NINE_ET)).toEqual([]);
    expect(listEnabled).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('reads the flag per tick instead of caching it at construction', async () => {
    // The scheduler holds the config service, not a boolean, so a change to the
    // service is seen by the next tick. (The service itself takes `DISCORD_ENABLED`
    // once at boot, so in production flipping the switch still means a restart —
    // see `docs/production-runbook.md`.)
    const config = { enabled: false };
    const post = vi.fn(async () => posted());
    const instance = new SlateScheduler(
      config as unknown as DiscordConfigService,
      { listEnabled: async () => [settings()] } as unknown as GuildConfigService,
      { post } as unknown as SlatePoster,
      { has: async () => false, remember: async () => {} } as unknown as DayKeyGuard,
    );

    expect(await instance.tick(NINE_ET)).toEqual([]);
    config.enabled = true;
    expect((await instance.tick(NINE_ET))[0].status).toBe('posted');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('the switch stops the card sweeps', () => {
  it('runs neither the lock sweep nor the settlement sweep', async () => {
    const run = vi.spyOn(CardSweep.prototype, 'run');

    const lock = new LockSweepService(moduleRef(false));
    const settlement = new SettlementSweepService(moduleRef(false));
    lock.onModuleInit();
    settlement.onModuleInit();

    await lock.sweepCards();
    await settlement.sweepCards();

    // No card is edited and no stamp is written while the switch is off.
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });

  it('runs both of them when the switch is on', async () => {
    const run = vi.spyOn(CardSweep.prototype, 'run').mockResolvedValue({
      skipped: true,
      candidates: 0,
      messages: 0,
      edited: 0,
      dead: 0,
      failed: 0,
    });

    const lock = new LockSweepService(moduleRef(true));
    const settlement = new SettlementSweepService(moduleRef(true));
    lock.onModuleInit();
    settlement.onModuleInit();

    await lock.sweepCards();
    await settlement.sweepCards();

    expect(run).toHaveBeenCalledTimes(2);
    run.mockRestore();
  });
});

describe('the switch refuses a pick click', () => {
  it('answers with the paused wording, after the ephemeral defer', async () => {
    const editReply = vi.fn(async () => undefined);
    const interaction = { editReply } as unknown as PausedInteraction;

    await refusePaused(interaction);

    expect(editReply).toHaveBeenCalledWith({ content: PAUSED_REPLY });
  });

  it('says it is paused and that nothing was saved', () => {
    // The two things a clicker needs to know; anything else is noise.
    expect(PAUSED_REPLY).toMatch(/paused/i);
    expect(PAUSED_REPLY).toMatch(/nothing was saved/i);
    expect(PAUSED_REPLY).not.toMatch(/failed|error/i);
  });

  it('logs the refusal as `paused`, so a maintenance window is visible in the logs', async () => {
    const interaction = {
      guildId: 'guild-1',
      user: { id: '123456789012345678' },
      customId: 'pick:0022600127:home',
      isButton: () => true,
      isChatInputCommand: () => false,
      editReply: vi.fn(async () => undefined),
    };

    await refusePaused(interaction as unknown as PausedInteraction);

    const line = interactionLog(interaction as unknown as Interaction, {
      outcome: 'ok',
      latencyMs: 20,
      ackMs: 18,
    });
    expect(line).toContain('outcome=paused');
  });
});
