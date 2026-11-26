import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ButtonStyle, ComponentType, type SendableChannels } from 'discord.js';
import type { Pace } from '../infrastructure/rate-limiter';
import { leaderboardEmbed } from '../leaderboard/leaderboard.embed';
import { PLAY_NOW_ID } from '../interactions/play.handler';
import { Infrastructure } from './infrastructure';
import { formatDayLabel, recapIntro, recapModes, shouldPostRecap } from './board';
import { BoardRepository, type LebronnectRecapDay } from './board-repository';
import { MAX_ROWS, recapField, renderRecapCard, type RecapCard } from './recap-card';
import { fetchImages, headshotUrl } from './recap-images';
import { SLATE_PACE, type SlateTarget } from './slate-poster';
import { etDateKey } from './slate-date';

/** What a recap attempt did, for the scheduler's log line. */
export type RecapStatus = 'posted' | 'skipped';

/** The card's attachment name. Referenced by the embed, so the two must agree. */
const CARD_FILE = 'lebronnect-recap.png';

/**
 * The line under today's chain. The names are already drawn above it, so this is the
 * ask rather than a restatement.
 */
const PITCH = 'Fewest hops wins. Play today’s chain and see if you can beat par.';

/**
 * The daily board: one finished slate day's leaderboard, posted unprompted, with the
 * day's Lebronnect recap underneath it.
 *
 * The board is the `/leaderboard` embed, unchanged and unparameterised by a viewer:
 * an unprompted recap has no caller whose row would be appended, which is why the
 * payload is built from `leaderboardEmbed` directly rather than through the command.
 * The ranking itself comes from the API — `GET /api/internal/leaderboard` — so the
 * bot never disagrees with the website about points.
 *
 * The card is the Wordle half: one row per player, their avatar and their five blocks,
 * so a guild can compare chains at a glance instead of reading names off a board. It is
 * drawn from `mini_game_results` for the same day, **scoped to this guild's members**,
 * because a top five from the whole league would name strangers.
 *
 * The day's rows appear twice: as text in a `Lebronnect` embed field, and as the card.
 * The field is the one that must survive, so it is built from the query result before
 * any image is touched — a CDN timeout costs the picture, not the list.
 *
 * **Neither half can cost the post.** Every path that could fail — the query, the four
 * image fetches, sharp itself — falls back to `null`, and `null` means the board goes
 * out alone. That is the same bargain the off-day note makes, for the same reason: the
 * leaderboard is the thing people are waiting for.
 *
 * Two gates, in order: the day must have settled picks (`shouldPostRecap`), and the
 * guild must not have been sent this day's board already (checked by the caller,
 * `BoardScheduler`, which owns the Redis key). A day with no picks costs one count and
 * no REST call.
 *
 * Sends into the guild's `/setup` channel with the shared pacing queue. It does not
 * run the card pipeline's permission preflight: nothing precedes this post any more,
 * so a missing `Send Messages` has to surface as the failure it is — the send throws,
 * the scheduler reports it and does not remember the day, and the next minute tries
 * again.
 */
@Injectable()
export class RecapPoster {
  private readonly logger = new Logger(RecapPoster.name);
  private readonly pace: Pace;

  constructor(
    private readonly infra: Infrastructure,
    private readonly repo: BoardRepository,
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

    // The Lebronnect field is built before a single image is fetched, so a slow or
    // failing CDN costs the picture and not the list. `null` covers both "nobody
    // played" and "the query failed", and either way the board goes out alone.
    const day = await this.recapDay(target.guildId, etKey);
    if (day) {
      const label = formatDayLabel(day.puzzleDate);
      embed.fields = [
        ...(embed.fields ?? []),
        {
          name: `Lebronnect · ${label}`,
          value: recapField({ day: label, played: day.played, rows: day.rows }),
          inline: false,
        },
      ];
    }

    const card = day ? await this.card(day, target.guildId, etKey) : null;
    if (card) {
      // Attached rather than linked: Discord serves it from its own CDN for the life of
      // the message, so the picture survives the bot being offline.
      embed.image = { url: `attachment://${CARD_FILE}` };
    }

    await this.pace<unknown>(
      () =>
        channel.send({
          content: recapIntro(etKey, settled),
          embeds: [embed],
          files: card ? [{ attachment: card, name: CARD_FILE }] : [],
          components: card ? [playNowRow()] : [],
        }),
      `POST /channels/${channel.id}/messages`,
    );

    this.logger.log(
      `Recap posted for guild ${target.guildId}: ${settled} settled pick(s) on ${etKey}${
        card ? ', with the Lebronnect card' : ', without a Lebronnect card'
      }.`,
    );
    return 'posted';
  }

  /**
   * One guild's Lebronnect day, or null.
   *
   * `etKey` is the slate day the board covers, which is the puzzle day the rows are
   * results for: the board posts the morning after, so the chain it recaps is
   * yesterday's and the one it sells is today's.
   *
   * The query and the picture are split because the embed field needs the first and
   * not the second. A failure here costs the whole Lebronnect field, so it is caught
   * rather than thrown — same bargain as `card()` below.
   */
  private async recapDay(guildId: string, etKey: string): Promise<LebronnectRecapDay | null> {
    try {
      return await this.repo.lebronnectRecap(guildId, etKey, etDateKey(new Date()), MAX_ROWS);
    } catch (error) {
      this.logger.warn(
        `Lebronnect recap skipped for guild ${guildId} on ${etKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** The card for a day already fetched, or null when the pictures or sharp fail. */
  private async card(
    day: LebronnectRecapDay,
    guildId: string,
    etKey: string,
  ): Promise<Buffer | null> {
    try {
      // Two batches, run together: five avatars and the headshots. Together because
      // they are independent, and a slow CDN should cost one timeout, not nine; apart
      // because the two sources are framed differently and only the headshots are cut
      // down to the face — see `normalise` in `recap-images.ts`.
      //
      // Today's pair is optional: before the next puzzle is published there are no
      // names to fetch for it, and the card draws without that footer.
      const pairs = day.today
        ? [day.chain.from, day.chain.to, day.today.from, day.today.to]
        : [day.chain.from, day.chain.to];
      const [avatars, headshots] = await Promise.all([
        fetchImages(day.rows.map((row) => row.avatarUrl)),
        fetchImages(
          pairs.map((player) => headshotUrl(player.externalId)),
          'headshot',
        ),
      ]);

      const card: RecapCard = {
        day: formatDayLabel(day.puzzleDate),
        par: day.par,
        played: day.played,
        rows: day.rows.map((row, index) => ({
          name: row.name,
          players: row.players,
          blocks: row.blocks,
          avatar: avatars[index] ?? null,
        })),
        yesterday: {
          from: { name: day.chain.from.name, headshot: headshots[0] ?? null },
          to: { name: day.chain.to.name, headshot: headshots[1] ?? null },
        },
        today: day.today
          ? {
              from: { name: day.today.from.name, headshot: headshots[2] ?? null },
              to: { name: day.today.to.name, headshot: headshots[3] ?? null },
            }
          : null,
        pitch: PITCH,
      };

      return await renderRecapCard(card);
    } catch (error) {
      // Logged as a warning, not an error: the board still goes out, and this is the
      // one line that says why the picture is missing.
      this.logger.warn(
        `Lebronnect card skipped for guild ${guildId} on ${etKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
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

/**
 * The button under the card.
 *
 * A launch-activity button has to be answered with callback type 12 as the *initial*
 * response, so the handler cannot defer first — see `play.handler.ts`. The custom id
 * is namespaced so the router's prefix match finds it.
 */
function playNowRow() {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: 'Play Now',
        custom_id: PLAY_NOW_ID,
      },
    ],
  };
}
