import { Injectable } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { PredictionMode } from '@iknoball/predictions';
import { IknoballClient } from '../api/iknoball.client';
import type { CommandHandler } from '../interactions/handler.types';
import { leaderboardEmbed, type ModeBoard } from './leaderboard.embed';

/**
 * `/leaderboard [mode]` — the server's board, as a public reply.
 *
 * Definition B (DISC-08): everyone in the server, ranked by every settled pick
 * they have made, whether it was placed here or on the website. The description
 * says "our members' points" for exactly that reason — "points earned in this
 * server" would describe the definition that was rejected.
 *
 * Both modes are shown in one embed unless a mode is passed, in which case only
 * that one is fetched. The reply is deferred first: two API calls are two round
 * trips, and the interaction has three seconds.
 */
@Injectable()
export class LeaderboardCommand implements CommandHandler {
  readonly data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Our members' points, ranked.")
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Show one mode instead of both.')
        .addChoices({ name: 'flat', value: 'flat' }, { name: 'weighted', value: 'weighted' }),
    );

  constructor(private readonly client: IknoballClient) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      // The board is a membership join, so there is nothing to join in a DM.
      await interaction.reply({
        content: 'The leaderboard is per server, so it only works inside one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const requested = interaction.options.getString('mode') as PredictionMode | null;
    const modes: PredictionMode[] = requested ? [requested] : ['flat', 'weighted'];

    // Public, and deferred: the reply is a shared board, not a personal one.
    await interaction.deferReply();

    // The viewer's own id is what earns them a row below the top ten, so a regular
    // who is ranked eleventh still sees where they stand.
    const viewerDiscordUserId = interaction.user.id;
    const boards: ModeBoard[] = await Promise.all(
      modes.map(async (mode) => ({
        mode,
        rows: await this.client.leaderboard({ guildId, mode, viewerDiscordUserId }),
      })),
    );

    await interaction.editReply({
      embeds: [leaderboardEmbed(boards, { guildName: interaction.guild?.name ?? null })],
    });
  }
}
