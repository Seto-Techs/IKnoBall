import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import type { Message, PublicThreadChannel, SendableChannels } from 'discord.js';
import { cardPayload, type CardPayload } from '../cards/card-payload';
import type { CardTeam } from '../cards/types';
import type { Pace } from '../infrastructure/rate-limiter';
import { Infrastructure } from './infrastructure';
import {
  CARDS_PER_MESSAGE,
  selectSlateGames,
  splitSlate,
  toCardGame,
  toCardTeams,
  type SlateGame,
} from './slate';
import { etDateKey, formatDayKey } from './slate-date';
import { SLATE_STORE, type CardAttachment, type CardClaim, type SlateStore } from './slate-store';

/** Where a guild's slate goes. */
export interface SlateTarget {
  guildId: string;
  channelId: string;
}

/**
 * One outbound Discord call, paced by DISC-12's shared queue.
 *
 * A token rather than a direct dependency: `RateLimiter` is a provider of the root
 * module, which exports nothing, so the module hands the poster a bound `schedule`
 * instead (see `scheduler.module.ts`). Absent — a unit test — it runs straight
 * through, which is what the poster's own tests assert about ordering.
 */
export const SLATE_PACE = 'SLATE_PACE';

export type PostStatus = 'posted' | 'empty' | 'already-posted';

export interface PostResult {
  status: PostStatus;
  /** The ET day the slate was for. */
  etKey: string;
  /** Cards actually sent. */
  games: number;
  /** Message ids in send order: the channel message first, then the thread's. */
  messageIds: string[];
  threadId: string | null;
}

/** What `/setup` shows: today's cards, with the buttons inert. */
export interface SlatePreview {
  etKey: string;
  /** Games on the day, which may be more than were previewed. */
  games: number;
  payloads: CardPayload[];
  /** How many games a real post would put in a thread. */
  threaded: number;
}

/**
 * Sends one guild's slate for one ET day.
 *
 * The order is the whole design: **claim the cards, then send**. A crash between
 * the two leaves `discord_cards` rows holding the pending marker, which costs a
 * card but can never post the same game twice; a crash after the send leaves the
 * rows attached to the real messages, so the retry finds every game claimed and
 * sends nothing (DISC-10).
 *
 * The day key in Redis is the scheduler's cheap check; this class does not touch
 * it, because "did this guild get its post" and "did these cards get sent" are
 * different questions and only the second one has to be crash-safe.
 *
 * Every REST call — the channel fetch, the send, the thread, the thread's sends —
 * goes through `pace`, which the module wires to DISC-12's shared queue. Before the
 * first send the channel's permissions are checked, so a guild the bot cannot post
 * in is skipped instead of paying a 403 (one invalid request against a 10,000-per-
 * ten-minutes ban).
 */
@Injectable()
export class SlatePoster {
  private readonly logger = new Logger(SlatePoster.name);
  private readonly pace: Pace;

  constructor(
    @Inject(SLATE_STORE) private readonly store: SlateStore,
    private readonly infra: Infrastructure,
    @Optional() @Inject(SLATE_PACE) pace?: Pace,
  ) {
    this.pace = pace ?? ((task) => task());
  }

  /** Today's slate for one guild. Posts nothing on a day with no games. */
  async post(target: SlateTarget, now: Date = new Date()): Promise<PostResult> {
    return this.postFor(target, etDateKey(now), now);
  }

  /**
   * The slate for a named ET day.
   *
   * The rollover is why this exists: after the last game of the night it posts the
   * *next* day, which is not `etDateKey(now)` until the small hours. Everything
   * else — the selection filter, the card claim, the send — is the same post, so
   * `post` is this method with the day derived from the clock.
   *
   * `now` still bounds the selection: a game that has already tipped off is not
   * pickable, so a late rollover posts what is left of the day rather than a slate
   * of dead cards.
   */
  async postFor(target: SlateTarget, etKey: string, now: Date = new Date()): Promise<PostResult> {
    const games = await this.slateGames(etKey, now);

    if (games.length === 0) {
      return { status: 'empty', etKey, games: 0, messageIds: [], threadId: null };
    }

    const claimed = await this.store.claimCards(
      games.map(
        (game): CardClaim => ({
          gameId: game.gameId,
          guildId: target.guildId,
          channelId: target.channelId,
        }),
      ),
    );
    const claimedIds = new Set(claimed);
    const posting = games.filter((game) => claimedIds.has(game.gameId));

    if (posting.length === 0) {
      // Every card already has a row: an earlier tick posted this slate (or
      // claimed it and died before sending). Either way there is nothing to send.
      return { status: 'already-posted', etKey, games: 0, messageIds: [], threadId: null };
    }

    const teams = await this.teamLookup(posting);
    const channel = await this.sendableChannel(target.channelId);
    const chunks = splitSlate(posting);

    // Preflight, not a probe: the permission set is computed from the guild the
    // gateway already has cached, so this costs no REST call — and a guild the bot
    // cannot post in costs one skipped slate instead of a 403.
    const missing = missingPermissions(channel, chunks.length > 1);
    if (missing.length > 0) {
      this.logger.warn(
        `Slate for guild ${target.guildId} skipped: channel ${channel.id} is missing ${missing.join(', ')}.`,
      );
      throw new MissingPermissionsError(channel.id, missing);
    }

    const first: Message = await this.pace<Message>(
      () => channel.send(messagePayload(chunks[0], teams)),
      `POST /channels/${channel.id}/messages`,
    );
    const messageIds = [first.id];
    await this.attach(chunks[0], target, channel.id, first.id);

    let threadId: string | null = null;
    if (chunks.length > 1) {
      const thread = await this.startThread(first, etKey);
      if (thread) {
        threadId = thread.id;
        for (const chunk of chunks.slice(1)) {
          const message = await this.pace(
            () => thread.send(messagePayload(chunk, teams)),
            `POST /channels/${thread.id}/messages`,
          );
          messageIds.push(message.id);
          await this.attach(chunk, target, thread.id, message.id);
        }
      }
    }

    this.logger.log(
      `Slate posted for guild ${target.guildId}: ${posting.length} card(s) for ${etKey}` +
        (threadId ? `, thread ${threadId}` : ''),
    );

    return { status: 'posted', etKey, games: posting.length, messageIds, threadId };
  }

  /**
   * Today's cards as `/setup` would show them.
   *
   * The same selection and the same payload builder as a real post, with the
   * buttons disabled: a preview must not look pickable, and its message is not in
   * `discord_cards`, so the lock sweep would never come back to freeze it.
   */
  async preview(now: Date = new Date()): Promise<SlatePreview> {
    const etKey = etDateKey(now);
    const games = await this.slateGames(etKey, now);
    const teams = await this.teamLookup(games);
    const shown = games.slice(0, CARDS_PER_MESSAGE);

    return {
      etKey,
      games: games.length,
      payloads: shown.map((game) => inert(cardPayload(toCardGame(game), toCardTeams(game, teams)))),
      threaded: Math.max(0, games.length - CARDS_PER_MESSAGE),
    };
  }

  private async slateGames(etKey: string, now: Date): Promise<SlateGame[]> {
    return selectSlateGames(await this.store.findGames(etKey), etKey, now);
  }

  private async teamLookup(games: readonly SlateGame[]): Promise<Map<string, CardTeam>> {
    const tricodes = games
      .flatMap((game) => [game.awayTeamTricode, game.homeTeamTricode])
      .filter((tricode): tricode is string => Boolean(tricode));
    const rows = await this.store.findTeams(tricodes);
    return new Map(rows.map((team) => [team.tricode, team]));
  }

  private async sendableChannel(channelId: string) {
    const channel = await this.pace(
      () => this.infra.client.channels.fetch(channelId),
      `GET /channels/${channelId}`,
    );
    if (!channel) throw new Error(`channel ${channelId} is not available to the bot`);
    if (!channel.isSendable()) throw new Error(`channel ${channelId} cannot receive messages`);
    return channel;
  }

  /**
   * The thread the rest of the slate goes in.
   *
   * A failure here is logged and swallowed: the first message is already out, and
   * losing the tail of a 12-game slate is better than losing the post and
   * re-running the whole thing. The unthreaded cards stay in `discord_cards`
   * holding the pending marker, which the lock sweep treats as a dead card.
   */
  private async startThread(
    first: Message,
    etKey: string,
  ): Promise<PublicThreadChannel<false> | null> {
    if (!first.inGuild()) {
      this.logger.warn('Slate overflow needs a thread, but the message is not in a guild.');
      return null;
    }

    try {
      return await this.pace(
        () =>
          first.startThread({
            name: `Slate — ${formatDayKey(etKey)}`,
            autoArchiveDuration: 1440,
            reason: 'Daily slate: more than four cards',
          }),
        `POST /channels/${first.channelId}/messages/${first.id}/threads`,
      );
    } catch (error) {
      this.logger.error(
        `Could not open the slate thread: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /** Record the ids that only exist once a message does. */
  private async attach(
    games: readonly SlateGame[],
    target: SlateTarget,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const attachments: CardAttachment[] = games.map((game) => ({
      gameId: game.gameId,
      guildId: target.guildId,
      channelId,
      messageId,
    }));

    try {
      await this.store.attachCards(attachments);
    } catch (error) {
      // The message is already sent, so the post succeeded; a card that keeps its
      // pending id is a card the lock sweep will skip, not a reason to retry.
      this.logger.error(
        `Could not record message ${messageId} in discord_cards: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

/** What every post needs, whatever its shape (DISC-12). */
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

/** A slate wider than one message also opens a thread for the rest. */
const THREAD_PERMISSIONS = [...POST_PERMISSIONS, PermissionFlagsBits.CreatePublicThreads] as const;

/** Discord's names for the flags, so a skip log names what an admin has to grant. */
const PERMISSION_NAMES: Readonly<Record<string, string>> = {
  [String(PermissionFlagsBits.ViewChannel)]: 'View Channel',
  [String(PermissionFlagsBits.SendMessages)]: 'Send Messages',
  [String(PermissionFlagsBits.EmbedLinks)]: 'Embed Links',
  [String(PermissionFlagsBits.CreatePublicThreads)]: 'Create Public Threads',
};

/**
 * A guild the bot cannot post in, thrown instead of sent.
 *
 * Discord counts a 403 as an invalid request, and 10,000 of those in ten minutes
 * earns a temporary ban, so a channel the bot cannot post in must be skipped
 * *before* the send rather than discovered by it. Thrown (not swallowed) so the
 * tick stops for that guild alone: `SlateScheduler` already catches per guild.
 */
export class MissingPermissionsError extends Error {
  constructor(
    readonly channelId: string,
    readonly missing: readonly string[],
  ) {
    super(`channel ${channelId} is missing ${missing.join(', ')}; skipping this guild's post`);
    this.name = 'MissingPermissionsError';
  }
}

/**
 * The permissions this channel is missing for the post we are about to make.
 *
 * `permissionsFor` computes from the guild the gateway already cached — no REST
 * call — and a channel that cannot answer (a DM, or a test's fake) yields an empty
 * list, because attempting the send is better than refusing on a lookup we could
 * not do. Threads are only required when the slate is wide enough to need one.
 */
function missingPermissions(channel: SendableChannels, threads: boolean): string[] {
  const me = 'guild' in channel ? channel.guild.members.me : null;
  if (!me || !('permissionsFor' in channel)) return [];

  const permissions = channel.permissionsFor(me);
  if (!permissions) return [];

  const required = threads ? THREAD_PERMISSIONS : POST_PERMISSIONS;
  return required
    .filter((permission) => !permissions.has(permission))
    .map((permission) => PERMISSION_NAMES[String(permission)] ?? String(permission));
}

/** One message's worth of cards: four embeds and four action rows at most. */
function messagePayload(games: readonly SlateGame[], teams: Map<string, CardTeam>): CardPayload {
  const payloads = games.map((game) => cardPayload(toCardGame(game), toCardTeams(game, teams)));
  return {
    embeds: payloads.flatMap((payload) => payload.embeds),
    components: payloads.flatMap((payload) => payload.components),
  };
}

/** The same payload with every button disabled, for the `/setup` preview. */
function inert(payload: CardPayload): CardPayload {
  return {
    embeds: payload.embeds,
    components: payload.components.map((row) => ({
      ...row,
      components: row.components.map((component) => ({ ...component, disabled: true })),
    })),
  };
}
