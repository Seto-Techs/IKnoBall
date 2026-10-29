import { describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { InteractionRouter } from './router';
import { PickHandler } from './pick.handler';
import { PingCommand } from './ping.command';

/** Resolves handler classes the way Nest's ModuleRef does, without a container. */
function routerWith(overrides: Record<unknown, unknown> = {}): InteractionRouter {
  const moduleRef = {
    get: (Handler: new () => unknown) => overrides[Handler] ?? new Handler(),
  };
  return new InteractionRouter(moduleRef as never);
}

function buttonInteraction(customId: string) {
  return {
    type: 3,
    customId,
    guildId: 'guild-1',
    replied: false,
    deferred: false,
    isButton: () => true,
    isChatInputCommand: () => false,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

function commandInteraction(commandName: string) {
  return {
    type: 2,
    commandName,
    guildId: 'guild-1',
    createdTimestamp: Date.now() - 12,
    replied: false,
    deferred: false,
    isButton: () => false,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

describe('InteractionRouter', () => {
  it('answers an unknown button custom_id ephemerally instead of crashing', async () => {
    const interaction = buttonInteraction('nope:1');

    await routerWith().handle(interaction as unknown as ButtonInteraction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'That is not an action I know how to do.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('routes a known button prefix to its handler', async () => {
    const interaction = buttonInteraction('pick:0012600009:home');
    // What the handler does with the interaction is its own spec's business; the
    // router only has to hand it over. Spying keeps this test from breaking every
    // time a handler's copy changes.
    const execute = vi.fn().mockResolvedValue(undefined);

    await routerWith({ [PickHandler]: { execute } }).handle(
      interaction as unknown as ButtonInteraction,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('routes a known command to its handler', async () => {
    const interaction = commandInteraction('ping');

    await routerWith().handle(interaction as unknown as ChatInputCommandInteraction);

    const [payload] = interaction.reply.mock.calls[0] as [{ content: string; flags: number }];
    expect(payload.content).toMatch(/^Pong! \d+ms round-trip\.$/);
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
  });

  it('answers an unknown command ephemerally', async () => {
    const interaction = commandInteraction('nuke');

    await routerWith().handle(interaction as unknown as ChatInputCommandInteraction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'That is not an action I know how to do.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('contains a handler that throws and answers the user', async () => {
    const interaction = buttonInteraction('pick:0012600009:home');
    const router = routerWith({
      [PickHandler]: {
        execute: async () => {
          throw new Error('boom');
        },
      },
    });

    await expect(
      router.handle(interaction as unknown as ButtonInteraction),
    ).resolves.toBeUndefined();

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong. Try again, or make the pick on the website.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('exposes one definition per registered command', () => {
    const definitions = routerWith().commandDefinitions();

    expect(definitions.map((definition) => definition.name).sort()).toEqual([
      'leaderboard',
      'link',
      'picks',
      'ping',
      'setup',
      'status',
      'unlink',
    ]);
    expect(new PingCommand().data.toJSON().name).toBe('ping');
  });
});
