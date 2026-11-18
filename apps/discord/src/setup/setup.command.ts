import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from '../interactions/handler.types';
import { localClock } from '../scheduler/slate-date';
import type { GuildConfigService, GuildSettings } from './guild-config.service';
import { GUILD_CONFIG } from './tokens';
import {
  DEFAULT_POST_HOUR,
  DEFAULT_TIMEZONE,
  TIMEZONE_HINT,
  canManageServer,
  channelProblem,
  formatPostHour,
  isSupportedPostHour,
  isSupportedTimezone,
} from './guild-settings';

/**
 * `/setup` — where and when this server gets its daily leaderboard.
 *
 * The board is the bot's only scheduled post now that picks live in the Activity, so
 * the channel and hour configured here are about that one post.
 *
 * Three rules the command enforces before it writes anything:
 *
 * - **Manage Server**, because the bot does not hold that permission itself and a
 *   member should not be able to point the bot at their own channel (DISC-09).
 * - A real IANA zone and an hour in 0–23, checked against `Intl` rather than a
 *   regex, so the scheduler can never be handed a zone it cannot format.
 * - A channel the bot can actually post in, so the failure shows up here instead
 *   of silently at 9 a.m.
 *
 * With no options it reports the current config. It no longer previews the day's
 * cards: the bot does not post them, and an admin should not be shown a post that will
 * never arrive.
 */
@Injectable()
export class SetupCommand implements CommandHandler {
  private readonly logger = new Logger(SetupCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure where and when this server gets the daily leaderboard.')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to post the daily leaderboard in.'),
    )
    .addIntegerOption((option) =>
      option
        .setName('hour')
        .setDescription('Local hour to post at, 0-23.')
        .setMinValue(0)
        .setMaxValue(23),
    )
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setDescription('IANA timezone, e.g. America/New_York.')
        .setMaxLength(64),
    );

  /**
   * Injected by token, not by class.
   *
   * `GuildConfigService` reaches `Infrastructure`, which reaches
   * `DiscordClientService` → `InteractionRouter` → the command registry → this file.
   * Importing it as a value closes that loop, and a class read before its module has
   * finished evaluating is `undefined` when the decorator metadata is built — Nest
   * would then have nothing to inject and the bot would fail to resolve `/setup` at
   * boot. The token in `./tokens` is a string in a file that imports nothing, so this
   * file's only runtime dependencies are the validators and the date helpers.
   */
  constructor(@Inject(GUILD_CONFIG) private readonly config: GuildConfigService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await reply(interaction, 'Run `/setup` in the server you want the board posted in.');
      return;
    }

    if (!canManageServer(interaction.memberPermissions)) {
      await reply(interaction, 'You need the **Manage Server** permission to configure the board.');
      return;
    }

    const channel = interaction.options.getChannel('channel');
    const hour = interaction.options.getInteger('hour');
    const timezone = interaction.options.getString('timezone');

    if (!channel && hour === null && timezone === null) {
      await this.showCurrent(interaction, guildId);
      return;
    }

    if (hour !== null && !isSupportedPostHour(hour)) {
      await reply(interaction, 'The posting hour has to be a whole hour from 0 to 23.');
      return;
    }

    if (timezone !== null && !isSupportedTimezone(timezone)) {
      await reply(interaction, `\`${timezone}\` is not a timezone I know. ${TIMEZONE_HINT}`);
      return;
    }

    const botMember = interaction.guild?.members.me ?? null;
    const botPermissions =
      channel && botMember && 'permissionsFor' in channel
        ? channel.permissionsFor(botMember)
        : null;

    if (channel) {
      const problem = channelProblem(channel, guildId, botPermissions);
      if (problem) {
        await reply(interaction, problem);
        return;
      }
    }

    const existing = await this.config.get(guildId);
    const channelId = channel?.id ?? existing?.channelId ?? null;

    if (!channelId) {
      await reply(
        interaction,
        'Choose the channel first: `/setup channel:#nba hour:9 timezone:America/New_York`.',
      );
      return;
    }

    const saved = await this.config.save({ guildId, channelId, postHour: hour, timezone });

    this.logger.log(
      `Leaderboard configured for guild ${guildId}: <#${saved.channelId}> ${formatPostHour(
        saved.postHour,
      )} ${saved.timezone}`,
    );

    await reply(interaction, confirmation(saved));
  }

  /** The no-argument form: the current config, and where picks happen now. */
  private async showCurrent(
    interaction: ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const settings = await this.config.get(guildId);
    const now = new Date();

    const lines = settings
      ? [
          `**Channel:** <#${settings.channelId}>`,
          `**Posts:** the leaderboard for the last finished slate, every day at ` +
            `${formatPostHour(settings.postHour)} ${settings.timezone}` +
            ` (it is ${localClock(now, settings.timezone)} there now)`,
          `**Status:** ${settings.enabled ? 'enabled' : 'paused'}`,
          '',
          'Change it with `/setup channel:#nba hour:9 timezone:America/New_York`.',
        ]
      : [
          'This server is not set up yet, so no leaderboard is posted.',
          `**Defaults:** every day at ${formatPostHour(DEFAULT_POST_HOUR)} ${DEFAULT_TIMEZONE}.`,
          'Start with `/setup channel:#nba`.',
        ];

    lines.push('', 'Picks are made in the Activity — type `/iknoball` in a channel to open it.');

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
}

function confirmation(settings: GuildSettings): string {
  return [
    '**Leaderboard configured for this server.**',
    `**Channel:** <#${settings.channelId}>`,
    `**Posts:** every day at ${formatPostHour(settings.postHour)} ${settings.timezone}`,
  ].join('\n');
}

async function reply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
