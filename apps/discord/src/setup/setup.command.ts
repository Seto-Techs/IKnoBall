import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from '../interactions/handler.types';
import type { SlatePreview, SlatePoster } from '../scheduler/slate-poster';
import { formatDayKey, localClock } from '../scheduler/slate-date';
import type { GuildConfigService, GuildSettings } from './guild-config.service';
import { GUILD_CONFIG, SLATE_POSTER } from './tokens';
import {
  DEFAULT_POST_HOUR,
  DEFAULT_TIMEZONE,
  TIMEZONE_HINT,
  canManageServer,
  channelProblem,
  formatPostHour,
  isSupportedPostHour,
  isSupportedTimezone,
  missingThreadPermissions,
} from './guild-settings';

/**
 * `/setup` — where and when this server gets its slate.
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
 * With no options it reports the current config and previews today's cards, which
 * is the only way an admin can see what the bot will post without waiting a day.
 */
@Injectable()
export class SetupCommand implements CommandHandler {
  private readonly logger = new Logger(SetupCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure where and when this server gets the daily slate.')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to post the daily slate in.'),
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
   * `GuildConfigService` and `SlatePoster` both reach `Infrastructure`, which
   * reaches `DiscordClientService` → `InteractionRouter` → the command registry →
   * this file. Importing either as a value closes that loop, and a class read
   * before its module has finished evaluating is `undefined` when the decorator
   * metadata is built — Nest would then have nothing to inject and the bot would
   * fail to resolve `/setup` at boot. The tokens in `./tokens` are strings in a
   * file that imports nothing, so this file's only runtime dependencies are the
   * validators and the date helpers.
   */
  constructor(
    @Inject(GUILD_CONFIG) private readonly config: GuildConfigService,
    @Inject(SLATE_POSTER) private readonly poster: SlatePoster,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await reply(interaction, 'Run `/setup` in the server you want the slate posted in.');
      return;
    }

    if (!canManageServer(interaction.memberPermissions)) {
      await reply(interaction, 'You need the **Manage Server** permission to configure the slate.');
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
      `Slate configured for guild ${guildId}: <#${saved.channelId}> ${formatPostHour(
        saved.postHour,
      )} ${saved.timezone}`,
    );

    const warnings = channel ? missingThreadPermissions(botPermissions) : [];
    await reply(interaction, confirmation(saved, warnings));
  }

  /** The no-argument form: current config, then today's cards. */
  private async showCurrent(
    interaction: ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const settings = await this.config.get(guildId);
    const preview = await this.poster.preview();
    const now = new Date();

    const lines = settings
      ? [
          `**Channel:** <#${settings.channelId}>`,
          `**Posts:** every day at ${formatPostHour(settings.postHour)} ${settings.timezone}` +
            ` (it is ${localClock(now, settings.timezone)} there now)`,
          `**Status:** ${settings.enabled ? 'enabled' : 'paused'}`,
          '',
          'Change it with `/setup channel:#nba hour:9 timezone:America/New_York`.',
        ]
      : [
          'This server is not set up yet, so no slate is posted.',
          `**Defaults:** every day at ${formatPostHour(DEFAULT_POST_HOUR)} ${DEFAULT_TIMEZONE}.`,
          'Start with `/setup channel:#nba`.',
        ];

    lines.push('', previewLine(preview));

    await interaction.reply({
      content: lines.join('\n'),
      embeds: preview.payloads.flatMap((payload) => payload.embeds),
      components: preview.payloads.flatMap((payload) => payload.components),
      flags: MessageFlags.Ephemeral,
    });
  }
}

function confirmation(settings: GuildSettings, warnings: readonly string[]): string {
  const lines = [
    '**Slate configured for this server.**',
    `**Channel:** <#${settings.channelId}>`,
    `**Posts:** every day at ${formatPostHour(settings.postHour)} ${settings.timezone}`,
  ];

  if (warnings.length > 0) {
    lines.push(
      '',
      `Heads up: I am missing ${warnings.join(' and ')} there, so a day with more than four games will only post the first four in the channel.`,
    );
  }

  return lines.join('\n');
}

/** What today's slate would look like, in one line. */
function previewLine(preview: SlatePreview): string {
  const day = formatDayKey(preview.etKey);

  if (preview.games === 0) {
    return `**Today's slate — ${day} (ET):** no games, so nothing would be posted.`;
  }

  if (preview.threaded === 0) {
    return `**Today's slate — ${day} (ET):** ${preview.games} game${
      preview.games === 1 ? '' : 's'
    } — one message.`;
  }

  return (
    `**Today's slate — ${day} (ET):** ${preview.games} games — ` +
    `${preview.games - preview.threaded} cards in the channel, the other ${preview.threaded} in a thread.`
  );
}

async function reply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
