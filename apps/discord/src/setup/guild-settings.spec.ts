import { describe, expect, it } from 'vitest';
import { ChannelType, PermissionFlagsBits, type PermissionsBitField } from 'discord.js';
import { canManageServer, channelProblem } from './guild-settings';

/**
 * `/setup`'s validation, without an interaction.
 *
 * The interesting cases are the ones Discord will happily let an admin type: a
 * channel from another server, a channel that holds no messages, and a channel the
 * bot is not allowed to write to.
 */

/** A permission set that grants exactly `granted`. */
function permissions(...granted: bigint[]): PermissionsBitField {
  const set = new Set(granted);
  return { has: (permission: bigint) => set.has(permission) } as unknown as PermissionsBitField;
}

const CHANNEL = {
  id: 'channel-1',
  name: 'nba',
  type: ChannelType.GuildText,
  guildId: 'guild-1',
};

describe('channel validation', () => {
  const all = permissions(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks);

  it('accepts a text channel the bot can post in', () => {
    expect(channelProblem(CHANNEL, 'guild-1', all)).toBeNull();
  });

  it('accepts an announcement channel', () => {
    expect(
      channelProblem({ ...CHANNEL, type: ChannelType.GuildAnnouncement }, 'guild-1', all),
    ).toBeNull();
  });

  it('rejects a channel that cannot hold messages', () => {
    expect(channelProblem({ ...CHANNEL, type: ChannelType.GuildVoice }, 'guild-1', all)).toMatch(
      /text or announcement/,
    );
    expect(channelProblem({ ...CHANNEL, type: ChannelType.GuildCategory }, 'guild-1', all)).toMatch(
      /text or announcement/,
    );
  });

  it('rejects a channel from another server', () => {
    expect(channelProblem(CHANNEL, 'guild-2', all)).toMatch(/another server/);
  });

  it('names the permission the bot is missing', () => {
    const problem = channelProblem(
      CHANNEL,
      'guild-1',
      permissions(PermissionFlagsBits.ViewChannel),
    );
    expect(problem).toContain('Send Messages');
    expect(problem).toContain('Embed Links');
  });

  it('does not invent a permission problem when it cannot compute them', () => {
    expect(channelProblem(CHANNEL, 'guild-1', null)).toBeNull();
  });
});

describe('Manage Server', () => {
  it('is required, because the bot does not hold it', () => {
    expect(canManageServer(permissions(PermissionFlagsBits.ManageGuild))).toBe(true);
    expect(canManageServer(permissions(PermissionFlagsBits.SendMessages))).toBe(false);
    expect(canManageServer(null)).toBe(false);
    expect(canManageServer(undefined)).toBe(false);
  });
});
