import { ChannelType, PermissionFlagsBits, type PermissionsBitField } from 'discord.js';

/**
 * What `/setup` accepts, and why.
 *
 * The validation lives here rather than in the command so it can be tested at the
 * edges — hour 0 and 23, a zone the runtime knows, a channel that is not a text
 * channel — without building an interaction.
 */

/** NBA convention, and the schema default: 9 a.m. in New York (DISC-09). */
export const DEFAULT_POST_HOUR = 9;
export const DEFAULT_TIMEZONE = 'America/New_York';

/** Shown whenever a zone is rejected, so the user sees the accepted shape. */
export const TIMEZONE_HINT =
  'Use an IANA zone, e.g. America/New_York, Europe/London, or Australia/Sydney.';

/**
 * The runtime's zone list.
 *
 * Read once: `Intl.supportedValuesOf` builds the whole array on every call, and
 * this is the source of truth for what the scheduler can format a time in.
 */
const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('timeZone'));

/** The zones this runtime accepts, for tests and for a diagnostic. */
export function supportedTimezones(): readonly string[] {
  return [...SUPPORTED_TIMEZONES];
}

/**
 * True when `zone` is an IANA zone this runtime can actually use.
 *
 * `Intl.supportedValuesOf('timeZone')` is the list, but it is not identical across
 * runtimes: Node's ICU (which is what production runs) omits `UTC` and
 * canonicalises some legacy aliases, while Bun's list includes them. A zone the
 * runtime's own `Intl` can format with is supported; anything it rejects is not.
 * That keeps the check free of a hand-maintained list and never accepts a zone
 * the scheduler would then fail to format.
 */
export function isSupportedTimezone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  if (SUPPORTED_TIMEZONES.has(zone)) return true;

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}

/** `postHour` is a whole hour of the day: 0–23. */
export function isSupportedPostHour(hour: number | null | undefined): boolean {
  return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

/** `09:00` for hour 9, so a 24-hour time never reads as 9 p.m. */
export function formatPostHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

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
 * otherwise fail silently at 9 a.m. every day.
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
