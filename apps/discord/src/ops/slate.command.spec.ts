import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { DiscordConfigService } from '../config/discord-config.service';
import { SlatePoster, type PostResult } from '../scheduler/slate-poster';
import { GuildConfigService } from '../setup/guild-config.service';
import { SlateCommand } from './slate.command';

/**
 * `/slate` is the operator's only way to put cards in a channel from Discord, and it
 * writes to every member's view of the server, so the gate is asserted here rather
 * than left to `operator.ts`: what matters is that the command refuses before it
 * resolves a single provider.
 */

const OPERATOR = '111111111111111111';
const STRANGER = '222222222222222222';
const GUILD = '333333333333333333';
const CHANNEL = '444444444444444444';

function posted(overrides: Partial<PostResult> = {}): PostResult {
  return { status: 'posted', etKey: '2026-11-25', games: 9, messageIds: ['555'], ...overrides };
}

function harness(options: { enabled?: boolean; channel?: boolean } = {}) {
  const postFor = vi.fn(async (): Promise<PostResult> => posted());
  const settings = {
    get: vi.fn(async () =>
      (options.channel ?? true)
        ? {
            guildId: GUILD,
            channelId: CHANNEL,
            enabled: true,
            installedAt: new Date(0),
            leftAt: null,
          }
        : null,
    ),
  };

  const providers = new Map<unknown, unknown>([
    [DiscordConfigService, { enabled: options.enabled ?? true }],
    [GuildConfigService, settings],
    [SlatePoster, { postFor }],
  ]);
  const resolved: unknown[] = [];

  const ref = {
    get: (token: unknown) => {
      resolved.push(token);
      if (!providers.has(token)) throw new Error(`unexpected provider: ${String(token)}`);
      return providers.get(token);
    },
  } as unknown as ModuleRef;

  return { command: new SlateCommand(ref), postFor, settings, resolved };
}

function commandInteraction(
  userId: string,
  options: { day?: string; force?: boolean; guildId?: string | null } = {},
) {
  return {
    commandName: 'slate',
    user: { id: userId },
    guildId: options.guildId === undefined ? GUILD : options.guildId,
    options: {
      getString: vi.fn((name: string) => (name === 'day' ? (options.day ?? null) : null)),
      getBoolean: vi.fn((name: string) => (name === 'force' ? (options.force ?? null) : null)),
    },
    reply: vi.fn(async (_payload: unknown) => undefined),
    deferReply: vi.fn(async (_payload: unknown) => undefined),
    editReply: vi.fn(async (_payload: unknown) => undefined),
  };
}

type FakeInteraction = ReturnType<typeof commandInteraction>;

function asInteraction(interaction: FakeInteraction): ChatInputCommandInteraction {
  return interaction as unknown as ChatInputCommandInteraction;
}

/** The one line the command answered with, whichever method carried it. */
function said(interaction: FakeInteraction): string {
  const call = interaction.editReply.mock.calls[0] ?? interaction.reply.mock.calls[0];
  return (call as [{ content: string }])[0].content;
}

/**
 * Every answer went to the operator alone. `editReply` cannot carry flags — it
 * inherits the visibility of the `deferReply` before it — so only the two calls
 * that decide it are checked.
 */
function hidden(interaction: FakeInteraction): boolean {
  const payloads = [...interaction.reply.mock.calls, ...interaction.deferReply.mock.calls] as [
    { flags?: number },
  ][];
  return (
    payloads.length > 0 &&
    payloads.every((payload) => ((payload[0].flags ?? 0) & MessageFlags.Ephemeral) !== 0)
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('the operator gate', () => {
  it('refuses everyone while DISCORD_OPERATOR_IDS is unset, before reading anything', async () => {
    const { command, resolved } = harness();
    const interaction = commandInteraction(OPERATOR);

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe('`/slate` is for the bot operator only.');
    expect(hidden(interaction)).toBe(true);
    expect(resolved).toEqual([]);
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('refuses an id that is not on the allow-list', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, resolved } = harness();
    const interaction = commandInteraction(STRANGER);

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe('`/slate` is for the bot operator only.');
    expect(resolved).toEqual([]);
  });

  it('answers an operator', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(postFor).toHaveBeenCalled();
    expect(hidden(interaction)).toBe(true);
  });
});

describe('the day', () => {
  it('defaults to the ET day, not the UTC one', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    // 03:30 UTC on the 26th is 22:30 on the 25th in New York: the slate is the 25th.
    vi.useFakeTimers({ now: new Date('2026-11-26T03:30:00.000Z') });
    const { command, postFor } = harness();
    const interaction = commandInteraction(OPERATOR);

    await command.execute(asInteraction(interaction));

    expect(postFor).toHaveBeenCalledWith(
      { guildId: GUILD, channelId: CHANNEL },
      '2026-11-25',
      expect.any(Date),
      { force: false },
    );
  });

  it('refuses a day that is not a real calendar day, before deferring', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    const interaction = commandInteraction(OPERATOR, { day: '2026-02-31' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toContain('"2026-02-31" is not a day');
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(postFor).not.toHaveBeenCalled();
  });
});

describe('the refusals', () => {
  it('asks for a server, because cards go in a channel', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command } = harness();
    const interaction = commandInteraction(OPERATOR, { guildId: null });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toContain('Run `/slate` in the server');
  });

  it('obeys the kill switch, because a manual post is still a post', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness({ enabled: false });
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toContain('DISCORD_ENABLED=false');
    expect(postFor).not.toHaveBeenCalled();
  });

  it('says so when the server has never been set up', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness({ channel: false });
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toContain('Run `/setup channel:#nba` there first');
    expect(postFor).not.toHaveBeenCalled();
  });
});

describe('the report', () => {
  it('names the day, the count, and the channel it went to', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command } = harness();
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe(`Posted 9 cards for Nov 25 in <#${CHANNEL}>.`);
    expect(hidden(interaction)).toBe(true);
  });

  it('counts one card in the singular', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    postFor.mockResolvedValue(posted({ games: 1 }));
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe(`Posted 1 card for Nov 25 in <#${CHANNEL}>.`);
  });

  it('teaches force where the operator hits it', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    postFor.mockResolvedValue(posted({ status: 'already-posted', games: 0, messageIds: [] }));
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toContain('already in this server');
    expect(said(interaction)).toContain('`force:true`');
  });

  it('says an empty day is empty, not a failure', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    postFor.mockResolvedValue(posted({ status: 'empty', games: 0, messageIds: [] }));
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe('Nothing sent: no game on Nov 25 is still open for picks.');
  });

  it('passes force through and says the earlier cards stay', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25', force: true });

    await command.execute(asInteraction(interaction));

    expect(postFor).toHaveBeenCalledWith(
      { guildId: GUILD, channelId: CHANNEL },
      '2026-11-25',
      expect.any(Date),
      { force: true },
    );
    expect(said(interaction)).toContain('The earlier cards stay in the channel');
  });

  it('reports a failed post instead of throwing', async () => {
    vi.stubEnv('DISCORD_OPERATOR_IDS', OPERATOR);
    const { command, postFor } = harness();
    postFor.mockRejectedValue(new Error('channel 444 is missing Send Messages'));
    const interaction = commandInteraction(OPERATOR, { day: '2026-11-25' });

    await command.execute(asInteraction(interaction));

    expect(said(interaction)).toBe('Posting Nov 25 failed: channel 444 is missing Send Messages');
  });
});
