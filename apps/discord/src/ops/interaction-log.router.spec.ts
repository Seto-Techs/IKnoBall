import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { MessageFlags, type ButtonInteraction, type Interaction } from 'discord.js';
import { InteractionRouter } from '../interactions/router';
import { markPaused } from './interaction-log';

/**
 * The router is the one place every interaction passes through, so it is the one
 * place the log line is written — including for the interactions that fail, which
 * are exactly the ones a per-handler logger would miss.
 *
 * These tests drive `InteractionRouter.handle()` and read what it actually logged,
 * so the properties being pinned are the ones production depends on: one line per
 * interaction, the right outcome, and a latency on every one of them.
 */

/** Collect the router's `interaction …` lines instead of printing them. */
function captureInteractionLines(): { lines: () => string[] } {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  return {
    lines: () =>
      log.mock.calls
        .map(([message]) => message)
        .filter((message): message is string => typeof message === 'string')
        .filter((message) => message.startsWith('interaction ')),
  };
}

/** Resolves handlers the way `ModuleRef` does; only the ids these tests use matter. */
function routerWith(handlers: Record<string, unknown> = {}): InteractionRouter {
  const moduleRef = {
    get: (Handler: { name: string }) => {
      const handler = handlers[Handler.name];
      if (!handler) throw new Error(`unexpected handler: ${Handler.name}`);
      return handler;
    },
  };
  return new InteractionRouter(moduleRef as never);
}

function button(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 3,
    id: 'interaction-1',
    customId,
    guildId: '1122334455',
    user: { id: '123456789012345678' },
    replied: false,
    deferred: false,
    isButton: () => true,
    isChatInputCommand: () => false,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fields(line: string): Record<string, string> {
  return Object.fromEntries(
    line
      .split(' ')
      .slice(1)
      .map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)];
      }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the router logs every interaction', () => {
  it('writes one line for a routed pick click, with the ack it saw', async () => {
    const log = captureInteractionLines();
    const handler = {
      execute: vi.fn(async (interaction: { deferReply: (payload: unknown) => Promise<void> }) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }),
    };
    const interaction = button('pick:0022600127:home');

    await routerWith({ PickHandler: handler }).handle(interaction as unknown as ButtonInteraction);

    const [line, ...rest] = log.lines();
    expect(rest).toEqual([]);
    expect(fields(line)).toMatchObject({
      outcome: 'ok',
      guild: '1122334455',
      kind: 'button',
      id: 'pick:0022600127:home',
    });
    // The handler deferred, so the ack is a real measurement, not `none`.
    expect(fields(line).ack).toMatch(/^\d+ms$/);
    expect(Number(fields(line).latency_ms)).toBeGreaterThanOrEqual(0);
  });

  it('writes one line when no handler is registered', async () => {
    const log = captureInteractionLines();

    await routerWith().handle(button('nope:1') as unknown as ButtonInteraction);

    expect(log.lines()).toHaveLength(1);
    expect(fields(log.lines()[0]).outcome).toBe('unknown');
  });

  it('writes one line, and answers the user, when a handler throws', async () => {
    const log = captureInteractionLines();
    const handler = {
      execute: vi.fn(async () => {
        throw new Error('api is down');
      }),
    };
    const interaction = button('pick:0022600127:home');

    await routerWith({ PickHandler: handler }).handle(interaction as unknown as ButtonInteraction);

    expect(log.lines()).toHaveLength(1);
    expect(fields(log.lines()[0]).outcome).toBe('failed');
    // The router answered on the user's behalf, so this one still met the deadline.
    expect(fields(log.lines()[0]).ack).toMatch(/^\d+ms$/);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong. Try again, or make the pick on the website.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('logs `ack=none` when even the fallback cannot be sent — the silent failure', async () => {
    const log = captureInteractionLines();
    const handler = {
      execute: vi.fn(async () => {
        throw new Error('api is down');
      }),
    };
    // An interaction the router cannot answer at all: nothing acknowledges it, so
    // the line is the only record that Discord already told the user it failed.
    const interaction = button('pick:0022600127:home', { isRepliable: () => false });

    await routerWith({ PickHandler: handler }).handle(interaction as unknown as ButtonInteraction);

    expect(fields(log.lines()[0])).toMatchObject({ outcome: 'failed', ack: 'none' });
  });

  it('writes one line for an interaction type the router does not handle', async () => {
    const log = captureInteractionLines();
    const interaction = {
      type: 5,
      id: 'interaction-2',
      guildId: '1122334455',
      user: { id: '123456789012345678' },
      isButton: () => false,
      isChatInputCommand: () => false,
      isRepliable: () => true,
    };

    await routerWith().handle(interaction as unknown as Interaction);

    expect(log.lines()).toHaveLength(1);
    expect(fields(log.lines()[0]).outcome).toBe('ignored');
  });

  it('logs a kill-switch refusal as `paused`, not as the handler succeeding', async () => {
    const log = captureInteractionLines();
    const handler = {
      execute: vi.fn(async (interaction: object) => {
        markPaused(interaction);
        await (interaction as { reply: (payload: unknown) => Promise<void> }).reply({});
      }),
    };

    await routerWith({ PickHandler: handler }).handle(
      button('pick:0022600127:home') as unknown as ButtonInteraction,
    );

    expect(fields(log.lines()[0]).outcome).toBe('paused');
  });

  it('never writes the raw user id, whatever the outcome', async () => {
    const log = captureInteractionLines();
    const failing = {
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    await routerWith({ PickHandler: failing }).handle(
      button('pick:0022600127:home') as unknown as ButtonInteraction,
    );
    await routerWith().handle(button('nope:1') as unknown as ButtonInteraction);

    for (const line of log.lines()) {
      expect(line).not.toContain('123456789012345678');
      expect(fields(line).user).toMatch(/^[0-9a-f]{10}$/);
    }
  });
});
