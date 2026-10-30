import { Injectable, Logger } from '@nestjs/common';
import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { ApiError } from '../api/errors';
import { IknoballClient } from '../api/iknoball.client';
import { DiscordConfigService } from '../config/discord-config.service';
import type { CommandHandler } from '../interactions/handler.types';
import { issueLinkCode } from './linking.api';
import { linkCodeUrl } from './links';

/**
 * `/link` — a single-use code and the page that spends it (DISC-06, path A).
 *
 * The code is the whole handshake: Discord proves *which* Discord account is
 * asking, the web session proves *which* IKnoBall account is answering, and the
 * code is what joins them. Neither side has to trust a value the other supplied,
 * which is why a code exists instead of, say, a `?discordId=` parameter.
 *
 * Anyone who signed in to IKnoBall with Discord is already resolvable through
 * Better Auth's `account` row, so they get told that instead of a code. Handing
 * out a code they do not need would suggest the link is missing when it is not.
 *
 * The reply is ephemeral: the code is a credential for ten minutes and must not
 * land in the channel scrollback.
 */
@Injectable()
export class LinkCommand implements CommandHandler {
  private readonly logger = new Logger(LinkCommand.name);

  readonly data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your IKnoBall account.');

  constructor(
    private readonly config: DiscordConfigService,
    private readonly client: IknoballClient,
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Acknowledge inside Discord's 3-second window; the code is a network round
    // trip away and the ephemeral flag cannot be added later.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordUserId = interaction.user.id;

    try {
      const { userId } = await this.client.resolveLink({ discordUserId });
      if (userId) {
        await interaction.editReply({
          content:
            'This Discord account is already linked to an IKnoBall account, so there is nothing to do — your clicks land on it already.\n' +
            'Use `/unlink` if you want to disconnect it.',
        });
        return;
      }

      const { code, expiresInSeconds } = await issueLinkCode(this.config, discordUserId);
      const url = linkCodeUrl(code);

      await interaction.editReply({
        content: [
          `Your linking code: **${code}**`,
          `Open ${url} while signed in to IKnoBall. The code is single use and expires in ${minutes(expiresInSeconds)}.`,
        ].join('\n\n'),
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Link,
                label: 'Open the linking page',
                url,
              },
            ],
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Issuing a linking code failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      const unavailable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      await interaction.editReply({
        content: unavailable
          ? 'IKnoBall is not answering right now, so no code was issued. Try `/link` again in a minute.'
          : 'Could not issue a linking code. Try `/link` again, or link from the website.',
      });
    }
  }
}

/** `600` → "10 minutes", without the arithmetic leaking into the copy. */
function minutes(seconds: number): string {
  const count = Math.max(1, Math.round(seconds / 60));
  return count === 1 ? '1 minute' : `${count} minutes`;
}
