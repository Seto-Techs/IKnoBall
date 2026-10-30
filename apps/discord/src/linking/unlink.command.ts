import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { ApiError } from '../api/errors';
import { DiscordConfigService } from '../config/discord-config.service';
import type { CommandHandler } from '../interactions/handler.types';
import { unlinkDiscord, type UnlinkResult } from './linking.api';
import { LINK_PAGE_URL } from './links';

/**
 * `/unlink` — disconnect this Discord account from its IKnoBall account.
 *
 * Only the bot's `discord_links` row is deleted. Nothing else changes: picks stay
 * on the account (the link is identity, not history), and the bot does not leave
 * any server — "unlink" reads like it might undo more than it does, so the reply
 * says all three things out loud.
 *
 * A Discord sign-in user has no row to delete. Their link lives in Better Auth's
 * `account` table, which this command must not touch — removing a sign-in method
 * would change how they log in. The reply points at the website instead of
 * claiming a disconnect that did not happen.
 */
@Injectable()
export class UnlinkCommand implements CommandHandler {
  private readonly logger = new Logger(UnlinkCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlink your Discord account from your IKnoBall account.');

  constructor(private readonly config: DiscordConfigService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await unlinkDiscord(this.config, interaction.user.id);
      await interaction.editReply({ content: replyFor(result) });
    } catch (error) {
      this.logger.error(
        `Unlinking failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      const unavailable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      await interaction.editReply({
        content: unavailable
          ? 'IKnoBall is not answering right now, so nothing was unlinked. Try `/unlink` again in a minute.'
          : `Could not unlink just now. You can also disconnect from ${LINK_PAGE_URL}.`,
      });
    }
  }
}

/** What the user is told, and the only place the caveats are worded. */
function replyFor({ removed, stillResolvable }: UnlinkResult): string {
  if (removed && stillResolvable) {
    return [
      'Unlinked: this Discord account no longer has an IKnoBall link of its own.',
      'Your picks are untouched, and you stay in every server — this command does not remove you from any of them.',
      'One thing to know: this account also signs in to IKnoBall with Discord, so your clicks still land on it. Remove the Discord sign-in from your profile if you want that to stop.',
    ].join('\n');
  }

  if (removed) {
    return [
      'Unlinked: this Discord account no longer answers for your IKnoBall account.',
      'Your picks are untouched, and you stay in every server — this command does not remove you from any of them.',
      'Run `/link` any time to connect it again.',
    ].join('\n');
  }

  if (stillResolvable) {
    return [
      'Nothing to unlink: this account is linked through Discord sign-in, not through `/link`.',
      `Clicks already land on your IKnoBall account. To stop that, remove the Discord sign-in on your profile: ${LINK_PAGE_URL}`,
    ].join('\n');
  }

  return [
    'Nothing to unlink: this Discord account is not linked to an IKnoBall account.',
    'Run `/link` to connect it.',
  ].join('\n');
}
