import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { DiscordConfigService } from '../config/discord-config.service';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { StatusCommand } from './status.command';

/**
 * `/status` is the one command that prints the process's internals, so the gate is
 * asserted here rather than left to `operator.ts`'s unit test: what matters is that
 * the command itself refuses, before it reads anything.
 */

const OPERATOR = '111111111111111111';
const STRANGER = '222222222222222222';

function fakeDatabase(): unknown {
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
        from: () =>
          chain(
            'configured' in shape
              ? [{ configured: '1' }]
              : [{ posted: '4', locked: '3', settled: '2', lastPostAt: new Date(0) }],
          ),
      }),
    },
  };
}

function moduleRef(): ModuleRef {
  const providers = new Map<unknown, unknown>([
    [DiscordConfigService, { enabled: true }],
    [DatabaseService, fakeDatabase()],
    [DiscordClientService, { client: { isReady: () => true, guilds: { cache: { size: 1 } } } }],
    [RateLimiter, { depth: () => 0 }],
  ]);

  return {
    get: (token: unknown) => {
      if (!providers.has(token)) throw new Error(`unexpected provider: ${String(token)}`);
      return providers.get(token);
    },
  } as unknown as ModuleRef;
}

function commandInteraction(userId: string) {
  return {
    commandName: 'status',
    user: { id: userId },
    reply: vi.fn(async (_payload: unknown) => undefined),
  };
}

type FakeInteraction = ReturnType<typeof commandInteraction>;

function asInteraction(interaction: FakeInteraction): ChatInputCommandInteraction {
  return interaction as unknown as ChatInputCommandInteraction;
}

function replied(interaction: FakeInteraction): { content: string; flags: number } {
  const [payload] = interaction.reply.mock.calls[0] as [{ content: string; flags: number }];
  return payload;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('StatusCommand', () => {
  it('answers an allow-listed operator, ephemerally', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const interaction = commandInteraction(OPERATOR);

    await new StatusCommand(moduleRef()).execute(asInteraction(interaction));

    const payload = replied(interaction);
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(payload.content).toContain('guilds: **1** connected');
    expect(payload.content).toContain('cards: **4** posted');
  });

  it('refuses anyone else, and prints no numbers', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const interaction = commandInteraction(STRANGER);

    await new StatusCommand(moduleRef()).execute(asInteraction(interaction));

    const payload = replied(interaction);
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(payload.content).toBe('`/status` is for the bot operator only.');
    expect(payload.content).not.toContain('guilds');
  });

  it('fails closed: nobody is an operator while DISCORD_OPERATOR_IDS is unset', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', '');
    const interaction = commandInteraction(OPERATOR);

    await new StatusCommand(moduleRef()).execute(asInteraction(interaction));

    expect(replied(interaction).content).toBe('`/status` is for the bot operator only.');
  });
});
