import { describe, expect, it, vi } from 'vitest';
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type PermissionsBitField,
} from 'discord.js';
import type { GuildConfigService, GuildSettings } from './guild-config.service';
import { SetupCommand } from './setup.command';

/**
 * `/setup`, driven as an interaction.
 *
 * The command is the only way a guild's row is created, so each rejection here is a
 * row that does not exist and a leaderboard that is never posted into a guessed
 * channel. The gateway is fake; the validation and the write are real.
 */

function permissions(...granted: bigint[]): PermissionsBitField {
  const set = new Set(granted);
  return { has: (permission: bigint) => set.has(permission) } as unknown as PermissionsBitField;
}

const ADMIN = permissions(PermissionFlagsBits.ManageGuild);
const MEMBER = permissions(PermissionFlagsBits.ViewChannel);

const CAN_POST = permissions(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks);

function channel(
  overrides: {
    id?: string;
    type?: ChannelType;
    guildId?: string;
    permissions?: PermissionsBitField;
  } = {},
) {
  return {
    id: overrides.id ?? 'channel-1',
    name: 'nba',
    type: overrides.type ?? ChannelType.GuildText,
    guildId: overrides.guildId ?? 'guild-1',
    permissionsFor: () => overrides.permissions ?? CAN_POST,
  };
}

interface InteractionOptions {
  channel?: ReturnType<typeof channel> | null;
  memberPermissions?: PermissionsBitField | null;
  guildId?: string | null;
}

function interaction(options: InteractionOptions = {}) {
  const reply = vi.fn(async (..._args: unknown[]) => ({}));

  const value = {
    guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
    memberPermissions: options.memberPermissions ?? ADMIN,
    guild: { members: { me: { id: 'bot-1' } } },
    options: {
      getChannel: () => options.channel ?? null,
    },
    reply,
  };

  return { interaction: value as unknown as ChatInputCommandInteraction, reply };
}

function settings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    enabled: true,
    installedAt: new Date('2026-10-01T00:00:00.000Z'),
    leftAt: null,
    ...overrides,
  };
}

function harness(options: { existing?: GuildSettings | null } = {}) {
  // Mirrors the service: the row keeps its identity and install date, and only the
  // channel is the admin's to change.
  const save = vi.fn(async (input: Parameters<GuildConfigService['save']>[0]) => {
    const base = options.existing ?? settings();
    return { ...base, channelId: input.channelId, enabled: true, leftAt: null };
  });
  const get = vi.fn(async () => options.existing ?? null);

  const command = new SetupCommand({ get, save } as unknown as GuildConfigService);

  return { command, save, get };
}

/** The text of the single reply, whichever overload was used. */
function replyText(reply: ReturnType<typeof vi.fn>): string {
  const [payload] = reply.mock.calls[0] as unknown as [{ content: string }];
  return payload.content;
}

describe('who may run it', () => {
  it('requires Manage Server, which the bot does not hold', async () => {
    const { command, save } = harness();
    const { interaction: fake, reply } = interaction({ memberPermissions: MEMBER });

    await command.execute(fake);

    expect(replyText(reply)).toContain('Manage Server');
    expect(save).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatchObject({ flags: MessageFlags.Ephemeral });
  });

  it('refuses to configure anything from a DM', async () => {
    const { command, save } = harness();
    const { interaction: fake, reply } = interaction({ guildId: null });

    await command.execute(fake);

    expect(replyText(reply)).toContain('in the server');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('what it accepts', () => {
  it('rejects a channel from another server', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction({ channel: channel({ guildId: 'guild-2' }) });

    await command.execute(fake);

    expect(replyText(reply)).toContain('another server');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a channel that cannot hold messages', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction({
      channel: channel({ type: ChannelType.GuildVoice }),
    });

    await command.execute(fake);

    expect(replyText(reply)).toContain('text or announcement');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a channel the bot cannot post in, and names the permission', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction({
      channel: channel({ permissions: permissions(PermissionFlagsBits.ViewChannel) }),
    });

    await command.execute(fake);

    expect(replyText(reply)).toContain('Send Messages');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('writes the channel it was given', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({ channel: channel({ id: 'channel-7' }) });

    await command.execute(fake);

    expect(save).toHaveBeenCalledWith({ guildId: 'guild-1', channelId: 'channel-7' });
    expect(replyText(reply)).toContain('<#channel-7>');
  });

  it('states the posting rule, because the time is not the admin\u2019s to set', async () => {
    const { command } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({ channel: channel() });

    await command.execute(fake);

    const text = replyText(reply);
    expect(text).toContain('15 minutes after the final game');
    expect(text).toContain('12:00 ET');
  });

  it('accepts a channel with just the posting permissions it needs', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({
      channel: channel({
        permissions: permissions(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks),
      }),
    });

    await command.execute(fake);

    expect(save).toHaveBeenCalledTimes(1);
    const text = replyText(reply);
    expect(text).toContain('Leaderboard configured for this server');
    expect(text).not.toContain('Heads up');
  });
});

describe('no arguments', () => {
  it('shows the current config and sends nothing else', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction();

    await command.execute(fake);

    const text = replyText(reply);
    expect(text).toContain('<#channel-1>');
    expect(text).toContain('12:00 ET');
    expect(text).toContain('enabled');
    expect(text).toContain('Picks are made in the Activity — type `/iknoball`');
    expect(save).not.toHaveBeenCalled();

    // No embeds and no buttons: the cards are gone, so there is nothing to preview.
    const [replyPayload] = reply.mock.calls[0] as unknown as [
      { embeds?: unknown[]; components?: unknown[]; flags: MessageFlags },
    ];
    expect(replyPayload.embeds).toBeUndefined();
    expect(replyPayload.components).toBeUndefined();
    expect(replyPayload.flags).toBe(MessageFlags.Ephemeral);
  });

  it('says the server is not set up yet, and how to start', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction();

    await command.execute(fake);

    const text = replyText(reply);
    expect(text).toContain('not set up yet');
    expect(text).toContain('no leaderboard is posted');
    expect(text).toContain('/setup channel:#nba');
    expect(text).toContain('/iknoball');
    expect(save).not.toHaveBeenCalled();
  });
});
