import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from '../interactions/handler.types';
import type { GuildConfigService, GuildSettings } from './guild-config.service';
import { GUILD_CONFIG } from './tokens';
import { canManageServer, channelProblem } from './guild-settings';

/**
 * `/setup` — where this server gets its daily leaderboard.
 *
 * The board is the bot's only scheduled post now that picks live in the Activity, and
 * it goes out at one instant for the whole fleet (the later of noon ET and fifteen
 * minutes after the last buzzer — see `recapDueAt`). That leaves the channel, and only
 * the channel, for an admin to choose: an hour option would be a setting that no
 * longer moves anything.
 *
 * Three rules the command enforces before it writes anything:
 *
 * - **Manage Server**, because the bot does not hold that permission itself and a
 *   member should not be able to point the bot at their own channel (DISC-09).
 * - A channel the bot can actually post in, so the failure shows up here instead of
 *   silently the next morning.
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
    .setDescription('Configure where this server gets the daily leaderboard.')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to post the daily leaderboard in.'),
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
   * file's only runtime dependencies are the validators.
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
    if (!channel) {
      await this.showCurrent(interaction, guildId);
      return;
    }

    const botMember = interaction.guild?.members.me ?? null;
    const botPermissions =
      'permissionsFor' in channel && botMember ? channel.permissionsFor(botMember) : null;

    const problem = channelProblem(channel, guildId, botPermissions);
    if (problem) {
      await reply(interaction, problem);
      return;
    }

    const saved = await this.config.save({ guildId, channelId: channel.id });

    this.logger.log(`Leaderboard configured for guild ${guildId}: <#${saved.channelId}>`);

    await reply(interaction, confirmation(saved));
  }

  /** The no-argument form: the current config, and where picks happen now. */
  private async showCurrent(
    interaction: ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const settings = await this.config.get(guildId);

    const lines = settings
      ? [
          `**Channel:** <#${settings.channelId}>`,
          `**Posts:** ${POSTS_LINE}`,
          `**Status:** ${settings.enabled ? 'enabled' : 'paused'}`,
          '',
          'Change it with `/setup channel:#nba`.',
        ]
      : [
          'This server is not set up yet, so no leaderboard is posted.',
          `**Posts:** ${POSTS_LINE}`,
          'Start with `/setup channel:#nba`.',
        ];

    lines.push('', 'Picks are made in the Activity — type `/iknoball` in a channel to open it.');

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
}

/**
 * What `/setup` says the board's timing is.
 *
 * Worded as a rule rather than a clock time, because the exact minute moves with the
 * last game of the slate: noon ET is the floor, not the schedule.
 */
const POSTS_LINE =
  'the leaderboard for the last finished slate, 15 minutes after the final game or at 12:00 ET, whichever is later.';

function confirmation(settings: GuildSettings): string {
  return [
    '**Leaderboard configured for this server.**',
    `**Channel:** <#${settings.channelId}>`,
    `**Posts:** ${POSTS_LINE}`,
  ].join('\n');
}

async function reply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
