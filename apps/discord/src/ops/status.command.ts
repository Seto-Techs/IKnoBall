import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandHandler } from '../interactions/handler.types';
import { isOperator } from './operator';
import { collectStatus, formatStatus } from './status-report';

/**
 * `/status` — the operator's view of this process (DISC-14).
 *
 * Three properties it is built around:
 *
 * 1. **Operator only, fail closed.** `DISCORD_OPERATOR_IDS` is an allow-list of
 *    Discord user ids; unset means nobody. See `operator.ts` for why this is not a
 *    Discord permission check.
 * 2. **Real numbers.** Every field is read live (`status-report.ts` documents each
 *    source); nothing is cached, so a number here is a number now.
 * 3. **It answers while the kill switch is on.** `/status` is how an operator
 *    confirms `DISCORD_ENABLED=false` took effect, so it must not be gated by it.
 *
 * The reply is ephemeral in both branches: the bot's internals are not channel
 * decoration, and a refusal that everyone can see invites people to keep trying.
 */
@Injectable()
export class StatusCommand implements CommandHandler {
  readonly data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Operator status: guilds, last slate post, cards, queue depth.');

  /**
   * `ModuleRef`, not the services themselves: `DatabaseService`, `RateLimiter`,
   * and `DiscordClientService` are providers of `AppModule`, and one of them
   * (`DiscordClientService`) would close an import cycle with this file. Resolving
   * through the container keeps the graph acyclic and matches every other feature
   * that needs the trunk's infrastructure.
   */
  constructor(private readonly moduleRef: ModuleRef) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction.user.id)) {
      await interaction.reply({
        content: '`/status` is for the bot operator only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const report = await collectStatus(this.moduleRef);

    await interaction.reply({
      content: formatStatus(report),
      flags: MessageFlags.Ephemeral,
    });
  }
}
