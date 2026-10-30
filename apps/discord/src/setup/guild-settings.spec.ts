import { describe, expect, it } from 'vitest';
import { ChannelType, PermissionFlagsBits, type PermissionsBitField } from 'discord.js';
import {
  DEFAULT_POST_HOUR,
  DEFAULT_TIMEZONE,
  canManageServer,
  channelProblem,
  formatPostHour,
  isSupportedPostHour,
  isSupportedTimezone,
  missingThreadPermissions,
  supportedTimezones,
} from './guild-settings';

/**
 * `/setup`'s validation, without an interaction.
 *
 * The interesting cases are the ones Discord will happily let an admin type: a
 * zone the runtime cannot format, an hour outside 0–23, and a channel the bot is
 * not allowed to write to.
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

describe('timezone validation', () => {
  it('accepts the zones the scheduler is documented with', () => {
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
      expect(isSupportedTimezone(zone), zone).toBe(true);
    }
  });

  it('accepts them because the runtime actually lists them', () => {
    const zones = new Set(supportedTimezones());
    expect(zones.has('America/New_York')).toBe(true);
    expect(zones.has('Europe/London')).toBe(true);
    expect(zones.has('Australia/Sydney')).toBe(true);
  });

  it('rejects a zone no Intl implementation knows', () => {
    expect(isSupportedTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isSupportedTimezone('Not/AZone')).toBe(false);
    expect(isSupportedTimezone('America/New York')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isSupportedTimezone(null)).toBe(false);
    expect(isSupportedTimezone(undefined)).toBe(false);
    expect(isSupportedTimezone('')).toBe(false);
  });

  it('defaults to the NBA convention', () => {
    expect(DEFAULT_POST_HOUR).toBe(9);
    expect(DEFAULT_TIMEZONE).toBe('America/New_York');
    expect(isSupportedTimezone(DEFAULT_TIMEZONE)).toBe(true);
  });
});

describe('post hour validation', () => {
  it('accepts every hour of the day', () => {
    for (let hour = 0; hour <= 23; hour += 1) expect(isSupportedPostHour(hour)).toBe(true);
  });

  it('rejects a 24-hour clock that is off the clock', () => {
    expect(isSupportedPostHour(-1)).toBe(false);
    expect(isSupportedPostHour(24)).toBe(false);
    expect(isSupportedPostHour(9.5)).toBe(false);
    expect(isSupportedPostHour(Number.NaN)).toBe(false);
    expect(isSupportedPostHour(null)).toBe(false);
    expect(isSupportedPostHour(undefined)).toBe(false);
  });

  it('formats as a 24-hour clock, so 9 is never read as 9 p.m.', () => {
    expect(formatPostHour(0)).toBe('00:00');
    expect(formatPostHour(9)).toBe('09:00');
    expect(formatPostHour(23)).toBe('23:00');
  });
});

describe('channel validation', () => {
  const all = permissions(
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
  );

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

describe('thread permissions', () => {
  it('warns only about the thread permissions, which are optional', () => {
    const warnings = missingThreadPermissions(
      permissions(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks),
    );
    expect(warnings).toEqual(['Create Public Threads', 'Send Messages in Threads']);
  });

  it('says nothing when the bot can thread', () => {
    expect(
      missingThreadPermissions(
        permissions(
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.SendMessagesInThreads,
        ),
      ),
    ).toEqual([]);
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
