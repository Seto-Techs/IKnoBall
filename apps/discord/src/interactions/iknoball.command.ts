import { Injectable, Logger } from '@nestjs/common';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from './handler.types';
import { launchActivityOrExplain } from './play.handler';

/**
 * `/iknoball` — the typed way to open the Activity.
 *
 * The app also has a `PRIMARY_ENTRY_POINT` command with this name, which Discord
 * creates when Activities are enabled and which only appears in the App Launcher.
 * Command names are unique per type, so this one is a separate, ordinary slash
 * command that opens the Activity from the chat input: same callback as the recap
 * card's button (`LAUNCH_ACTIVITY`, type 12), no API call and no database read.
 *
 * It answers for itself rather than deferring, because Discord only accepts a
 * launch as the *initial* response to an interaction.
 */
@Injectable()
export class LaunchCommand implements CommandHandler {
  private readonly logger = new Logger(LaunchCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('iknoball')
    .setDescription('Play IKnoBall — picks, Lebronnect and the leaderboard.');

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await launchActivityOrExplain(interaction, this.logger);
  }
}
