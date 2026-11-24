import { ChannelType, PermissionFlagsBits, type PermissionsBitField } from 'discord.js';

/**
 * What `/setup` accepts, and why.
 *
 * The validation lives here rather than in the command so it can be tested at the
 * edges — a channel from another server, a voice channel, a channel the bot cannot
 * write to — without building an interaction.
 */

/** The parts of a channel `/setup` inspects. */
export interface SetupChannel {
  id: string;
  name?: string | null;
  type: ChannelType;
  guildId?: string | null;
}

/**
 * Why this channel cannot hold the slate, or null when it can.
 *
 * Two checks: it has to be a channel that holds messages (a voice channel or a
 * category is not), and the bot has to be allowed to post in it. The second one
 * is the one worth catching early — a channel the bot cannot write to would
 * otherwise fail silently every morning.
 */
export function channelProblem(
  channel: SetupChannel,
  guildId: string,
  botPermissions: PermissionsBitField | null,
): string | null {
  if (channel.guildId && channel.guildId !== guildId) {
    return 'That channel belongs to another server.';
  }

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    return 'Pick a text or announcement channel — that one cannot hold the slate.';
  }

  if (botPermissions) {
    const missing = requiredPermissions().filter((permission) => !botPermissions.has(permission));
    if (missing.length > 0) {
      return `I cannot post in <#${channel.id}> yet: I need ${missing
        .map((permission) => `**${permissionName(permission)}**`)
        .join(' and ')} there.`;
    }
  }

  return null;
}

function requiredPermissions(): bigint[] {
  return [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
}

/** Discord's own names for the two permissions above. */
function permissionName(permission: bigint): string {
  if (permission === PermissionFlagsBits.SendMessages) return 'Send Messages';
  if (permission === PermissionFlagsBits.EmbedLinks) return 'Embed Links';
  return 'that permission';
}

/**
 * `/setup` is an admin action: the bot does not hold Manage Server, so the caller
 * has to. `ManageGuild` is Discord's "Manage Server".
 */
export function canManageServer(permissions: PermissionsBitField | null | undefined): boolean {
  return permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}
