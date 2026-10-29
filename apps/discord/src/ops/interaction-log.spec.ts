import { describe, expect, it, vi } from 'vitest';
import type { Interaction } from 'discord.js';
import { interactionLog, markPaused, trackAck } from './interaction-log';
import { hashUserId } from './user-hash';

/**
 * The one line per interaction the router writes.
 *
 * Two things are being pinned: every field an operator needs is present, and the
 * raw Discord id never appears in it.
 */

const USER_ID = '123456789012345678';

interface FakeInteraction {
  guildId: string | null;
  user: { id: string };
  customId: string;
  commandName: string;
  type: number;
  id: string;
  isButton(): boolean;
  isChatInputCommand(): boolean;
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  deferUpdate: ReturnType<typeof vi.fn>;
}

function buttonInteraction(overrides: Partial<FakeInteraction> = {}): FakeInteraction {
  return {
    guildId: '1122334455',
    user: { id: USER_ID },
    customId: 'pick:0022600127:home',
    commandName: '',
    type: 3,
    id: 'interaction-1',
    isButton: () => true,
    isChatInputCommand: () => false,
    reply: vi.fn(async () => undefined),
    deferReply: vi.fn(async () => undefined),
    deferUpdate: vi.fn(async () => undefined),
    ...overrides,
  };
}

function commandInteraction(): FakeInteraction {
  return buttonInteraction({
    customId: '',
    commandName: 'status',
    type: 2,
    isButton: () => false,
    isChatInputCommand: () => true,
  });
}

function asInteraction(interaction: FakeInteraction): Interaction {
  return interaction as unknown as Interaction;
}

/** `key=value` pairs, as the operator reads them. */
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

describe('interactionLog', () => {
  it('carries guild, hashed user, custom id, outcome, ack and latency', () => {
    const line = interactionLog(asInteraction(buttonInteraction()), {
      outcome: 'ok',
      latencyMs: 63,
      ackMs: 41,
    });

    expect(line.startsWith('interaction ')).toBe(true);
    expect(fields(line)).toEqual({
      outcome: 'ok',
      guild: '1122334455',
      user: hashUserId(USER_ID),
      kind: 'button',
      id: 'pick:0022600127:home',
      ack: '41ms',
      latency_ms: '63',
    });
  });

  it('never writes the raw Discord user id', () => {
    const line = interactionLog(asInteraction(buttonInteraction()), {
      outcome: 'ok',
      latencyMs: 12,
      ackMs: 3,
    });

    expect(line).not.toContain(USER_ID);
  });

  it('says `dm` when there is no guild, so a server-only command in a DM stands out', () => {
    const line = interactionLog(asInteraction(buttonInteraction({ guildId: null })), {
      outcome: 'ok',
      latencyMs: 5,
      ackMs: 2,
    });

    expect(fields(line).guild).toBe('dm');
  });

  it('names a slash command the way it is typed', () => {
    const line = interactionLog(asInteraction(commandInteraction()), {
      outcome: 'ok',
      latencyMs: 8,
      ackMs: 4,
    });

    expect(fields(line)).toMatchObject({ kind: 'command', id: '/status' });
  });

  it('writes `ack=none` when the handler never acknowledged — the blown-deadline signal', () => {
    const line = interactionLog(asInteraction(buttonInteraction()), {
      outcome: 'failed',
      latencyMs: 3010,
      ackMs: null,
    });

    expect(fields(line)).toMatchObject({ ack: 'none', latency_ms: '3010', outcome: 'failed' });
  });

  it('reports a paused refusal as `paused`, not as the handler’s success', () => {
    const interaction = buttonInteraction();
    markPaused(interaction);

    const line = interactionLog(asInteraction(interaction), {
      outcome: 'ok',
      latencyMs: 20,
      ackMs: 18,
    });

    expect(fields(line).outcome).toBe('paused');
  });
});

describe('trackAck', () => {
  it('times the first acknowledgement and puts the methods back', async () => {
    const interaction = buttonInteraction();
    const originalDefer = interaction.deferReply;
    const originalReply = interaction.reply;

    const tracker = trackAck(asInteraction(interaction));
    // The router measures from receipt; the first ack is the number that matters.
    await interaction.deferReply({ flags: 64 });
    await interaction.reply({ content: 'later' });
    tracker.stop();

    expect(tracker.ackMs()).not.toBeNull();
    // The wrapped method still called through to the real one.
    expect(originalDefer).toHaveBeenCalledWith({ flags: 64 });
    expect(originalReply).toHaveBeenCalledWith({ content: 'later' });
    // …and the interaction is not left patched: `stop()` restored the originals.
    expect(interaction.deferReply).toBe(originalDefer);
    expect(interaction.reply).toBe(originalReply);
  });

  it('reports null when nothing acknowledged', () => {
    const tracker = trackAck(asInteraction(buttonInteraction()));

    expect(tracker.ackMs()).toBeNull();
    tracker.stop();
  });

  it('counts deferUpdate as an acknowledgement', async () => {
    const interaction = buttonInteraction();
    const tracker = trackAck(asInteraction(interaction));

    await interaction.deferUpdate();
    tracker.stop();

    expect(tracker.ackMs()).not.toBeNull();
  });
});
