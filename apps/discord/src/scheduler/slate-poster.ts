import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import type { Message, SendableChannels } from 'discord.js';
import { cardPayload, type CardPayload } from '../cards/card-payload';
import type { CardStake, CardTeam } from '../cards/types';
import type { Pace } from '../infrastructure/rate-limiter';
import { Infrastructure } from './infrastructure';
import { hasGamesOn, selectSlateGames, toCardGame, toCardTeams, type SlateGame } from './slate';
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
  /** One message id per card, in tip-off order. */
  messageIds: string[];
}

/** What a post can be asked to do beyond its default. */
export interface PostOptions {
  /**
   * Post the day again, even though this guild's cards are already claimed.
   *
   * The claim is the double-post guard, so a deliberate re-post has to release it
   * first — `releaseCards`, then claim as usual. Only the games still on the slate
   * are released, so a game that has tipped off is neither duplicated nor stripped
   * of its lock stamp, and the messages already in the channel are left alone.
   */
  force?: boolean;
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
 * One card per message. Discord draws every embed in a message above every action
 * row, so a message holding several cards shows all of them and then all of their
 * button rows, leaving the reader to guess which buttons pick which game. Sending
 * each card separately is the only shape where a game's buttons sit under that
 * game's card.
 *
 * The day key in Redis is the scheduler's cheap check; this class does not touch
 * it, because "did this guild get its post" and "did these cards get sent" are
 * different questions and only the second one has to be crash-safe.
 *
 * Every REST call — the channel fetch and each send — goes through `pace`, which
 * the module wires to DISC-12's shared queue. Before the first send the channel's
 * permissions are checked, so a guild the bot cannot post in is skipped instead of
 * paying a 403 (one invalid request against a 10,000-per-ten-minutes ban).
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

  /**
   * The ET day a timed post should use at `now`.
   *
   * The earliest day from today that still has a game a reader can pick. That is
   * today for a guild whose hour lands before its own slate tips off — and the
   * *next* slate for a guild whose local morning is already the ET evening. A 9 a.m.
   * post in Jakarta is 10 p.m. the night before in New York, so `etDateKey(now)`
   * there is yesterday's slate and every card on it has already tipped: the timed
   * post used to aim at it anyway and send nothing, which left every guild east of
   * ET with no working post of its own.
   *
   * Falls back to today when nothing ahead is pickable, so the post is empty rather
   * than for a day the schedule does not have.
   */
  async nextSlateDay(now: Date = new Date()): Promise<string> {
    const today = etDateKey(now);
    return (await this.store.nextPickableDay(today, now)) ?? today;
  }

  /**
   * Whether the schedule lists any game at all on `etKey`, tipped or not.
   *
   * The same rows and the same day rule the cards are selected by, so "there are no
   * games today" can never contradict "there was nothing to post today".
   */
  async hasGames(etKey: string): Promise<boolean> {
    return hasGamesOn(await this.store.findGames(etKey), etKey);
  }

  /**
   * The one line a game-less day gets.
   *
   * Silence on a day the league is off is indistinguishable from a bot that has
   * died, and it matters more now that this note sits beside the only post the bot
   * makes: a channel with neither a board nor a note looks broken. `nextKey` is null
   * only when nothing ahead is pickable either, and then the line says so instead of
   * naming a day.
   */
  async postOffDay(target: SlateTarget, day: string, nextKey: string | null): Promise<void> {
    const channel = await this.sendableChannel(target.channelId);
    this.assertCanPost(target, channel);

    const message: Message = await this.pace<Message>(
      () => channel.send({ content: offDayMessage(day, nextKey) }),
      `POST /channels/${channel.id}/messages`,
    );

    this.logger.log(`Off-day note posted for guild ${target.guildId} on ${day}: ${message.id}`);
  }

  /**
   * The slate for a named ET day.
   *
   * Two callers: `BoardScheduler`, which posts the next slate alongside the nightly
   * board, and the operator ops — `bun run force:slate` and `/slate` — which post a
   * named day by hand, including one that has already gone out (`options.force`).
   *
   * `now` still bounds the selection: a game that has already tipped off is not
   * pickable, so a late post sends what is left of the day rather than a slate of
   * dead cards.
   *
   * `options.force` is for the case the claim guard makes impossible on purpose: a
   * day already in the channel that has to go out again. See `PostOptions`.
   */
  async postFor(
    target: SlateTarget,
    etKey: string,
    now: Date = new Date(),
    options: PostOptions = {},
  ): Promise<PostResult> {
    const games = await this.slateGames(etKey, now);

    if (games.length === 0) {
      return { status: 'empty', etKey, games: 0, messageIds: [] };
    }

    if (options.force) {
      await this.store.releaseCards(
        games.map((game) => game.gameId),
        target.guildId,
      );
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
      return { status: 'already-posted', etKey, games: 0, messageIds: [] };
    }

    const teams = await this.teamLookup(posting);
    const stakes = await this.store.findStakes(posting.map((game) => game.gameId));
    const channel = await this.sendableChannel(target.channelId);
    this.assertCanPost(target, channel);

    const messageIds: string[] = [];
    for (const game of posting) {
      const message: Message = await this.pace<Message>(
        () => channel.send(cardPayloadFor(game, teams, stakes)),
        `POST /channels/${channel.id}/messages`,
      );
      messageIds.push(message.id);
      await this.attach(game, target, channel.id, message.id);
    }

    this.logger.log(
      `Slate posted for guild ${target.guildId}: ${posting.length} card(s) for ${etKey}`,
    );

    return { status: 'posted', etKey, games: posting.length, messageIds };
  }

  /**
   * The games a post for `etKey` would send, with nothing claimed and nothing sent.
   *
   * The selection half of `postFor`, on its own: `bun run force:slate --dry-run`
   * uses it to show an operator what is about to go into a channel before it goes,
   * and it is the only caller that needs the two halves apart.
   */
  async plan(etKey: string, now: Date = new Date()): Promise<SlateGame[]> {
    return this.slateGames(etKey, now);
  }

  private async slateGames(etKey: string, now: Date): Promise<SlateGame[]> {
    return selectSlateGames(await this.store.findGames(etKey), etKey, now);
  }

  /**
   * The `teams` rows for these games, with their record for the slate's season.
   *
   * The season comes from the games themselves rather than from the clock: a slate
   * posted on the ET evening of the last day of a season would otherwise look up
   * the new season's empty record for every card.
   */
  private async teamLookup(games: readonly SlateGame[]): Promise<Map<string, CardTeam>> {
    const tricodes = games
      .flatMap((game) => [game.awayTeamTricode, game.homeTeamTricode])
      .filter((tricode): tricode is string => Boolean(tricode));
    const season = games.find((game) => game.seasonYear)?.seasonYear ?? null;
    const rows = await this.store.findTeams(tricodes, season);
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
   * Refuse a channel the bot cannot post in, before spending a send on it.
   *
   * Preflight, not a probe: the permission set is computed from the guild the
   * gateway already has cached, so this costs no REST call — and a guild the bot
   * cannot post in costs one skipped post instead of a 403.
   */
  private assertCanPost(target: SlateTarget, channel: SendableChannels): void {
    const missing = missingPermissions(channel);
    if (missing.length === 0) return;

    this.logger.warn(
      `Post for guild ${target.guildId} skipped: channel ${channel.id} is missing ${missing.join(', ')}.`,
    );
    throw new MissingPermissionsError(channel.id, missing);
  }

  /** Record the ids that only exist once a message does. */
  private async attach(
    game: SlateGame,
    target: SlateTarget,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const attachments: CardAttachment[] = [
      { gameId: game.gameId, guildId: target.guildId, channelId, messageId },
    ];

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

/** Discord's names for the flags, so a skip log names what an admin has to grant. */
const PERMISSION_NAMES: Readonly<Record<string, string>> = {
  [String(PermissionFlagsBits.ViewChannel)]: 'View Channel',
  [String(PermissionFlagsBits.SendMessages)]: 'Send Messages',
  [String(PermissionFlagsBits.EmbedLinks)]: 'Embed Links',
};

/**
 * A guild the bot cannot post in, thrown instead of sent.
 *
 * Discord counts a 403 as an invalid request, and 10,000 of those in ten minutes
 * earns a temporary ban, so a channel the bot cannot post in must be skipped
 * *before* the send rather than discovered by it. Thrown (not swallowed) so the
 * tick stops for that guild alone: `BoardScheduler` already catches per guild.
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
 * not do.
 */
function missingPermissions(channel: SendableChannels): string[] {
  // `client.user` is null when the bot runs as a REST-only client (e.g.
  // `force:slate`, which never logs in so it cannot flap the live session): in
  // that shape there is no member object to preflight against, so the check is
  // a no-op and a bad channel surfaces as the send's own error. Reading
  // `channel.guild.members.me` directly would otherwise dereference the null
  // `client.user.id` and throw before we ever reached the send.
  if (!channel.client?.user) return [];

  const me = 'guild' in channel && channel.guild ? channel.guild.members.me : null;
  if (!me || !('permissionsFor' in channel)) return [];

  const permissions = channel.permissionsFor(me);
  if (!permissions) return [];

  return POST_PERMISSIONS.filter((permission) => !permissions.has(permission)).map(
    (permission) => PERMISSION_NAMES[String(permission)] ?? String(permission),
  );
}

/** One game's card: an embed and its own action row. */
function cardPayloadFor(
  game: SlateGame,
  teams: ReadonlyMap<string, CardTeam>,
  stakes: ReadonlyMap<string, CardStake>,
): CardPayload {
  return cardPayload(toCardGame(game), toCardTeams(game, teams, stakes.get(game.gameId)));
}

/**
 * What a game-less day says.
 *
 * Names the day and, when the schedule knows it, the slate that follows — a reader
 * needs a date to come back for, not an apology.
 */
export function offDayMessage(day: string, nextKey: string | null): string {
  const line = `**No NBA games on ${formatDayKey(day)}.**`;
  return nextKey === null
    ? `${line} The next slate is not on the schedule yet.`
    : `${line} The next slate is **${formatDayKey(nextKey)}**.`;
}
