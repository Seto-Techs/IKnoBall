import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { SendableChannels } from 'discord.js';
import type { Pace } from '../infrastructure/rate-limiter';
import { leaderboardEmbed } from '../leaderboard/leaderboard.embed';
import { Infrastructure } from './infrastructure';
import { recapIntro, recapModes, shouldPostRecap } from './rollover';
import { RolloverRepository } from './rollover-repository';
import { SLATE_PACE, type SlateTarget } from './slate-poster';

/** What a recap attempt did, for the scheduler's log line. */
export type RecapStatus = 'posted' | 'skipped';

/**
 * "Today's picks", posted when the last game of the day goes final.
 *
 * The board is the `/leaderboard` embed, unchanged and unparameterised by a viewer:
 * an unprompted recap has no caller whose row would be appended, which is why the
 * payload is built from `leaderboardEmbed` directly rather than through the command.
 * The ranking itself comes from the API — `GET /api/internal/leaderboard` — so the
 * bot never disagrees with the website about points.
 *
 * Two gates, in order: the day must have settled picks (`shouldPostRecap`), and the
 * guild must not have been recapped for that day already (checked by the caller,
 * `RolloverScheduler`, which owns the Redis key). A day with no picks costs one
 * count and no REST call.
 *
 * Sends into the guild's slate channel with the same pacing as a slate post. It does
 * not re-run the permission preflight: the slate this recap follows was just sent
 * into the same channel, so a `403` here would already have failed there.
 */
@Injectable()
export class RecapPoster {
  private readonly logger = new Logger(RecapPoster.name);
  private readonly pace: Pace;

  constructor(
    private readonly infra: Infrastructure,
    private readonly repo: RolloverRepository,
    @Optional() @Inject(SLATE_PACE) pace?: Pace,
  ) {
    this.pace = pace ?? ((task) => task());
  }

  /** Posts one guild's board for one finished ET slate day. */
  async post(target: SlateTarget, etKey: string): Promise<RecapStatus> {
    const settled = await this.repo.settledPickCount(target.guildId, etKey);
    if (!shouldPostRecap(settled)) return 'skipped';

    const boards = await Promise.all(
      recapModes(null).map(async (mode) => ({
        mode,
        rows: await this.infra.api.leaderboard({ guildId: target.guildId, mode }),
      })),
    );

    const channel = await this.sendableChannel(target.channelId);
    const embed = leaderboardEmbed(boards, {
      guildName: this.infra.client.guilds.cache.get(target.guildId)?.name ?? null,
    });

    await this.pace<unknown>(
      () => channel.send({ content: recapIntro(etKey, settled), embeds: [embed] }),
      `POST /channels/${channel.id}/messages`,
    );

    this.logger.log(
      `Recap posted for guild ${target.guildId}: ${settled} settled pick(s) on ${etKey}.`,
    );
    return 'posted';
  }

  private async sendableChannel(channelId: string): Promise<SendableChannels> {
    const channel = await this.pace(
      () => this.infra.client.channels.fetch(channelId),
      `GET /channels/${channelId}`,
    );
    if (!channel) throw new Error(`channel ${channelId} is not available to the bot`);
    if (!channel.isSendable()) throw new Error(`channel ${channelId} cannot receive messages`);
    return channel;
  }
}
