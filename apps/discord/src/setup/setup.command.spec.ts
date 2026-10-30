import { describe, expect, it, vi } from 'vitest';
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type PermissionsBitField,
} from 'discord.js';
import type { CardPayload } from '../cards/card-payload';
import type { SlatePoster, SlatePreview } from '../scheduler/slate-poster';
import type { GuildConfigService, GuildSettings } from './guild-config.service';
import { SetupCommand } from './setup.command';

/**
 * `/setup`, driven as an interaction.
 *
 * The command is the only way a guild's row is created, so each rejection here is
 * a row that does not exist and a slate that is never posted into a guessed
 * channel. The gateway is fake; the validation and the write are real.
 */

function permissions(...granted: bigint[]): PermissionsBitField {
  const set = new Set(granted);
  return { has: (permission: bigint) => set.has(permission) } as unknown as PermissionsBitField;
}

const ADMIN = permissions(PermissionFlagsBits.ManageGuild);
const MEMBER = permissions(PermissionFlagsBits.ViewChannel);

const CAN_POST = permissions(
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads,
);

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
  hour?: number | null;
  timezone?: string | null;
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
      getInteger: () => options.hour ?? null,
      getString: () => options.timezone ?? null,
    },
    reply,
  };

  return { interaction: value as unknown as ChatInputCommandInteraction, reply };
}

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

function preview(overrides: Partial<SlatePreview> = {}): SlatePreview {
  return { etKey: '2026-10-27', games: 0, payloads: [], threaded: 0, ...overrides };
}

function harness(options: { existing?: GuildSettings | null; preview?: SlatePreview } = {}) {
  // Mirrors the service: an unspecified field keeps the stored value, and only
  // then falls back to the default.
  const save = vi.fn(async (input: Parameters<GuildConfigService['save']>[0]) => {
    const base = options.existing ?? settings();
    return {
      ...base,
      ...input,
      postHour: input.postHour ?? base.postHour,
      timezone: input.timezone ?? base.timezone,
      enabled: true,
      leftAt: null,
    };
  });
  const get = vi.fn(async () => options.existing ?? null);
  const previewCards = vi.fn(async () => options.preview ?? preview());

  const command = new SetupCommand(
    { get, save } as unknown as GuildConfigService,
    { preview: previewCards } as unknown as SlatePoster,
  );

  return { command, save, get, previewCards };
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
  it('rejects an hour off the 24-hour clock', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction({ hour: 24 });

    await command.execute(fake);

    expect(replyText(reply)).toContain('0 to 23');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a timezone the runtime cannot format', async () => {
    const { command, save } = harness({ existing: settings() });
    const { interaction: fake, reply } = interaction({ timezone: 'Mars/Olympus_Mons' });

    await command.execute(fake);

    expect(replyText(reply)).toContain('not a timezone I know');
    expect(replyText(reply)).toContain('America/New_York');
    expect(save).not.toHaveBeenCalled();
  });

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

  it('asks for a channel before writing a row', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({ hour: 8 });

    await command.execute(fake);

    expect(replyText(reply)).toContain('Choose the channel first');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('writes the channel, hour, and zone it was given', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({
      channel: channel(),
      hour: 14,
      timezone: 'Europe/London',
    });

    await command.execute(fake);

    expect(save).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      postHour: 14,
      timezone: 'Europe/London',
    });
    expect(replyText(reply)).toContain('<#channel-1>');
    expect(replyText(reply)).toContain('14:00 Europe/London');
  });

  it('leaves the hour and zone alone when only the channel is given', async () => {
    const { command, save } = harness({ existing: settings({ postHour: 7 }) });
    const { interaction: fake, reply } = interaction({ channel: channel({ id: 'channel-9' }) });

    await command.execute(fake);

    expect(save).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-9',
      postHour: null,
      timezone: null,
    });
    // The confirmation reports the stored hour, not a reset one.
    expect(replyText(reply)).toContain('07:00 America/New_York');
  });

  it('warns about the thread permissions without refusing the channel', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction({
      channel: channel({
        permissions: permissions(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks),
      }),
    });

    await command.execute(fake);

    expect(save).toHaveBeenCalledTimes(1);
    expect(replyText(reply)).toContain('Create Public Threads');
    expect(replyText(reply)).toContain('first four');
  });
});

describe('no arguments', () => {
  it('shows the current config and today’s cards', async () => {
    const payload = { embeds: [{ title: 'BKN @ BOS' }], components: [] } as unknown as CardPayload;
    const { command, previewCards } = harness({
      existing: settings(),
      preview: preview({ games: 2, payloads: [payload] }),
    });
    const { interaction: fake, reply } = interaction();

    await command.execute(fake);

    const text = replyText(reply);
    expect(text).toContain('<#channel-1>');
    expect(text).toContain('09:00 America/New_York');
    expect(text).toContain('enabled');
    expect(text).toContain("**Today's slate — Oct 27 (ET):** 2 games — one message.");
    expect(previewCards).toHaveBeenCalledTimes(1);

    const [replyPayload] = reply.mock.calls[0] as unknown as [
      { embeds: unknown[]; flags: MessageFlags },
    ];
    expect(replyPayload.embeds).toHaveLength(1);
    expect(replyPayload.flags).toBe(MessageFlags.Ephemeral);
  });

  it('says the server is not set up yet, and what the defaults are', async () => {
    const { command, save } = harness({ existing: null });
    const { interaction: fake, reply } = interaction();

    await command.execute(fake);

    const text = replyText(reply);
    expect(text).toContain('not set up yet');
    expect(text).toContain('09:00 America/New_York');
    expect(text).toContain('nothing would be posted');
    expect(save).not.toHaveBeenCalled();
  });

  it('previews a threaded day as channel cards plus a thread', async () => {
    const { command } = harness({
      existing: settings(),
      preview: preview({ games: 6, threaded: 2 }),
    });
    const { interaction: fake, reply } = interaction();

    await command.execute(fake);

    expect(replyText(reply)).toContain('4 cards in the channel, the other 2 in a thread');
  });
});
