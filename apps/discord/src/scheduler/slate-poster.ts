import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import type { Message, SendableChannels } from 'discord.js';
import { cardPayload, type CardPayload } from '../cards/card-payload';
import type { CardStake, CardTeam } from '../cards/types';
import type { Pace } from '../infrastructure/rate-limiter';
import { Infrastructure } from './infrastructure';
import { selectSlateGames, toCardGame, toCardTeams, type SlateGame } from './slate';
import { etDateKey } from './slate-date';
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

/** Cards `/setup` prints before it stops: a preview shares one message's embeds. */
const PREVIEW_CARDS = 3;

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

/** What `/setup` shows: today's first cards, with the buttons inert. */
export interface SlatePreview {
  etKey: string;
  /** Games on the day, which can be more than were previewed. */
  games: number;
  payloads: CardPayload[];
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
      return { status: 'empty', etKey, games: 0, messageIds: [] };
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

    // Preflight, not a probe: the permission set is computed from the guild the
    // gateway already has cached, so this costs no REST call — and a guild the bot
    // cannot post in costs one skipped slate instead of a 403.
    const missing = missingPermissions(channel);
    if (missing.length > 0) {
      this.logger.warn(
        `Slate for guild ${target.guildId} skipped: channel ${channel.id} is missing ${missing.join(', ')}.`,
      );
      throw new MissingPermissionsError(channel.id, missing);
    }

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

  /**
   * Today's cards as `/setup` would show them.
   *
   * The same selection and the same payload builder as a real post, with the
   * buttons disabled: a preview must not look pickable, and its message is not in
   * `discord_cards`, so the lock sweep would never come back to freeze it.
   *
   * Capped at three cards because the preview puts them in one ephemeral reply, and
   * a message holds ten embeds. The line above the cards still reports the day's
   * full count.
   */
  async preview(now: Date = new Date()): Promise<SlatePreview> {
    const etKey = etDateKey(now);
    const games = await this.slateGames(etKey, now);
    const teams = await this.teamLookup(games);
    const stakes = await this.store.findStakes(games.map((game) => game.gameId));
    const shown = games.slice(0, PREVIEW_CARDS);

    return {
      etKey,
      games: games.length,
      payloads: shown.map((game) =>
        inert(cardPayload(toCardGame(game), toCardTeams(game, teams, stakes.get(game.gameId)))),
      ),
    };
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
