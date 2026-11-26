import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { DiscordConfigService } from '../config/discord-config.service';
import type { CommandHandler } from '../interactions/handler.types';
import { etDateKey, formatDayKey, isDateKey } from '../scheduler/slate-date';
import { SlatePoster, type PostResult } from '../scheduler/slate-poster';
import { GuildConfigService } from '../setup/guild-config.service';
import { paused } from './kill-switch';
import { isOperator } from './operator';

/**
 * `/slate` — post a slate day's cards now, from Discord.
 *
 * `bun run force:slate` already does this from a shell, and this command is the same
 * post through the same `SlatePoster.postFor`: an entry point, not a second
 * implementation. It exists because the operator is in Discord when a channel is
 * missing its cards, and a shell on the box is not always the nearest tool.
 *
 * Three properties it inherits rather than re-decides:
 *
 * 1. **Operator only, fail closed.** `isOperator()` reads `DISCORD_OPERATOR_IDS`, the
 *    allow-list `/status` uses, and an unset list means nobody. It is not a Discord
 *    permission check: a server admin is not the bot operator, and this command puts
 *    cards in front of every member of their server (`operator.ts` has the rest).
 * 2. **No new schedule.** Nothing here runs on its own; the board cron is still the
 *    only timed post.
 * 3. **It obeys the kill switch.** A manual post is still a post, so
 *    `DISCORD_ENABLED=false` refuses it with the same predicate the scheduler uses.
 *
 * `force` is the one thing the shell tool could not do. The claim in `discord_cards`
 * is the double-post guard, so a day already in the channel answers `already-posted`
 * and sends nothing — right for a retry, wrong for an operator who needs the cards
 * sent again. `force` releases this server's claims for the games still on the slate
 * and posts: the earlier messages stay in the channel, and the bot's lock and
 * settlement edits follow the new ones from here on.
 */
@Injectable()
export class SlateCommand implements CommandHandler {
  readonly data = new SlashCommandBuilder()
    .setName('slate')
    .setDescription('Operator: post a slate day’s cards now.')
    .addStringOption((option) =>
      option
        .setName('day')
        .setDescription('Slate day in US/Eastern, YYYY-MM-DD. Defaults to today (ET).')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('force')
        .setDescription('Post it again even if this server already has that day’s cards.')
        .setRequired(false),
    );

  /**
   * `ModuleRef`, not the services themselves: `SlatePoster` and `GuildConfigService`
   * are providers of `SchedulerModule` and `DiscordConfigService` of the config
   * module, none of which export what this needs — and importing the scheduler here
   * would point a cycle back at it. Resolving through the container is the pattern
   * `status-report.ts` established.
   */
  constructor(private readonly moduleRef: ModuleRef) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction.user.id)) {
      await interaction.reply({
        content: '`/slate` is for the bot operator only.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'Run `/slate` in the server whose cards you want posted.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // One clock read for both the default day and the tip-off cut, so a run started
    // at 23:59:59 cannot name one day and select against another.
    const now = new Date();
    const day = interaction.options.getString('day')?.trim() || etDateKey(now);

    if (!isDateKey(day)) {
      await interaction.reply({
        content: `"${day}" is not a day. Use YYYY-MM-DD, e.g. ${etDateKey(now)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // A post is one REST call per card and Discord wants the ack within three
    // seconds, so everything from here answers through `editReply`.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const config = this.moduleRef.get(DiscordConfigService, { strict: false });
    if (paused(config)) {
      await interaction.editReply({
        content:
          '`DISCORD_ENABLED=false`, so nothing is posted. Turn it back on and restart the bot, then run `/slate` again.',
      });
      return;
    }

    const settings = await this.moduleRef.get(GuildConfigService, { strict: false }).get(guildId);
    if (!settings) {
      await interaction.editReply({
        content: `Server ${guildId} has no slate channel yet. Run \`/setup channel:#nba\` there first.`,
      });
      return;
    }

    const force = interaction.options.getBoolean('force') ?? false;

    try {
      const result = await this.moduleRef
        .get(SlatePoster, { strict: false })
        .postFor({ guildId, channelId: settings.channelId }, day, now, { force });

      await interaction.editReply({ content: outcome(result, settings.channelId, force) });
    } catch (error) {
      // A failed post is the operator's news, not the channel's: the reply stays
      // ephemeral and says what Discord refused.
      await interaction.editReply({
        content: `Posting ${formatDayKey(day)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }
}

/**
 * What happened, in the operator's terms.
 *
 * The `already-posted` line names `force` because that is the moment the operator
 * learns the option exists — the same place the CLI's report used to tell them to go
 * and delete rows by hand.
 */
function outcome(result: PostResult, channelId: string, force: boolean): string {
  const day = formatDayKey(result.etKey);

  if (result.status === 'posted') {
    const again = force ? ' The earlier cards stay in the channel; the bot now edits these.' : '';
    return `Posted ${count(result.games)} for ${day} in <#${channelId}>.${again}`;
  }

  if (result.status === 'empty') {
    return `Nothing sent: no game on ${day} is still open for picks.`;
  }

  return `Nothing sent: ${day} is already in this server. Run \`/slate\` again with \`force:true\` to post it a second time.`;
}

function count(games: number): string {
  return `${games} card${games === 1 ? '' : 's'}`;
}
