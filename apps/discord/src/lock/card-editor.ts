import type { Channel, Client, TextBasedChannel } from 'discord.js';
import type { CardPayload } from '../cards/card-payload';
import { classifyEditFailure } from './card-edit';

/** Where a posted card lives. Both ids come straight off `discord_cards`. */
export interface CardTarget {
  channelId: string;
  messageId: string;
}

/**
 * The one thing a sweep does to Discord: replace a card's payload.
 *
 * An interface rather than a discord.js client so a sweep test can hand it a fake
 * that throws a 403 or an `UnknownMessage`, which is the only way to exercise the
 * dead-card path without a guild.
 */
export interface CardEditor {
  /** False while the gateway is connecting: an edit then fails for a reason that is not the card's. */
  ready(): boolean;
  editCard(target: CardTarget, payload: CardPayload): Promise<void>;
}

/**
 * A channel the card cannot live in: it is gone, or it is not a channel messages
 * can be edited in. Carries the Discord code for "unknown channel" so
 * `classifyEditFailure` treats it exactly like a 404 from the API.
 */
export class CardChannelGoneError extends Error {
  readonly code = 10003;

  constructor(channelId: string) {
    super(`channel ${channelId} is gone or cannot hold a card`);
    this.name = 'CardChannelGoneError';
  }
}

/**
 * Edits cards through the gateway client's REST layer.
 *
 * `messages.edit(messageId, payload)` is a single `PATCH /channels/{c}/messages/{m}`:
 * it does not fetch the message first, which is what keeps a lock or settlement
 * at one REST call per card (DISC-05). The channel is resolved once and cached,
 * because every card in a channel shares it and `channels.fetch` is a REST call
 * of its own.
 *
 * No fetch-and-patch of the existing message: the payload is rebuilt from
 * `schedule_games` instead, so a lock does not depend on reading the message it
 * is about to replace.
 */
export class DiscordCardEditor implements CardEditor {
  /** `null` caches "this channel is gone", so a dead channel is looked up once. */
  private readonly channels = new Map<string, TextBasedChannel | null>();

  constructor(private readonly client: Client) {}

  ready(): boolean {
    return this.client.isReady();
  }

  async editCard(target: CardTarget, payload: CardPayload): Promise<void> {
    const channel = await this.channel(target.channelId);

    await channel.messages.edit(target.messageId, {
      embeds: payload.embeds,
      components: payload.components,
    });
  }

  private async channel(channelId: string): Promise<TextBasedChannel> {
    const cached = this.channels.get(channelId);
    if (cached) return cached;
    if (cached === null) throw new CardChannelGoneError(channelId);

    let channel: Channel | null = this.client.channels.cache.get(channelId) ?? null;
    if (!channel) {
      try {
        channel = await this.client.channels.fetch(channelId);
      } catch (error) {
        // A channel that is gone stays gone for this process; anything else (a
        // 5xx, a timeout) must be retried on the next sweep, so it is not cached.
        if (classifyEditFailure(error) === 'dead') this.channels.set(channelId, null);
        throw error;
      }
    }

    if (!channel || !channel.isTextBased()) {
      this.channels.set(channelId, null);
      throw new CardChannelGoneError(channelId);
    }

    this.channels.set(channelId, channel);
    return channel;
  }
}
