import { Injectable } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from './handler.types';

@Injectable()
export class PingCommand implements CommandHandler {
  readonly data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check that the bot is awake.');

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // `createdTimestamp` is when Discord received the interaction, so the delta
    // is the round trip a user actually waits for: gateway hop plus dispatch.
    const latencyMs = Date.now() - interaction.createdTimestamp;

    await interaction.reply({
      content: `Pong! ${latencyMs}ms round-trip.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
