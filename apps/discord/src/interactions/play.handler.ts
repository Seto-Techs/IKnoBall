import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { ButtonHandler } from './handler.types';

/** The recap card's button. Namespaced so the router's prefix match finds it. */
export const PLAY_PREFIX = 'play:';
export const PLAY_NOW_ID = `${PLAY_PREFIX}now`;

/**
 * Open the Activity, or say why it would not open.
 *
 * Shared by the button and `/iknoball`, because both face the same two
 * constraints: a launch has to be the initial response (so nothing may be
 * acknowledged first), and a launch can be refused — a client that does not
 * support Activities, or an app whose embedded surfaces are off. The router's
 * generic failure text talks about picks, which is the wrong thing to say under a
 * game, so this answers for itself.
 */
export async function launchActivityOrExplain(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  logger: Logger,
): Promise<void> {
  try {
    await interaction.launchActivity();
  } catch (error) {
    logger.warn(
      `Could not launch the Activity for user ${interaction.user.id} in guild ${
        interaction.guildId ?? 'dm'
      }: ${error instanceof Error ? error.message : String(error)}`,
    );

    try {
      await interaction.reply({
        content:
          'IKnoBall could not open here. Activities need the Discord desktop or mobile app — try again there.',
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // The interaction was already answered or has expired. Nothing left to say.
    }
  }
}

/**
 * `play:` — the "Play Now" button under the daily board's recap card.
 *
 * Opens the Activity in the channel the button was pressed in. Discord only accepts a
 * launch as the **initial** response to the click (callback type 12), so this handler
 * acknowledges nothing first: no `deferReply`, no `reply`, just the launch. That is also
 * why it is a button rather than a link — a link would leave the server.
 *
 * No API call and no database read: launching is the client's job, and the Activity
 * signs the player in itself when it boots.
 */
@Injectable()
export class PlayHandler implements ButtonHandler {
  private readonly logger = new Logger(PlayHandler.name);

  async execute(interaction: ButtonInteraction): Promise<void> {
    await launchActivityOrExplain(interaction, this.logger);
  }
}
