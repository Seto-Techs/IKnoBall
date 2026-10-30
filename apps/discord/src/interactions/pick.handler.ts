import { Injectable, Logger } from '@nestjs/common';
import { ButtonStyle, ComponentType, MessageFlags, type ButtonInteraction } from 'discord.js';
import { potentialPoints, type OddsSide } from '@iknoball/predictions';
import { ApiError, NotImplementedError } from '../api/errors';
import { IknoballClient } from '../api/iknoball.client';
import type { PickResult } from '../api/types';
import { parsePickCustomId, pickCustomId, type PickTarget } from '../cards/pick-id';
import { gameWebUrl, messageJumpUrl } from '../cards/web-links';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused, refusePaused } from '../ops/kill-switch';
import type { ButtonHandler } from './handler.types';

/**
 * `pick:<gameId>:<side>` — one ephemeral confirmation per clicker.
 *
 * The card is shared, so the only per-user surface Discord offers is an
 * ephemeral reply: it is invisible to everyone else and disappears on its own
 * (DISC-04). That makes the *write* the record and the reply only feedback, which
 * is why the write happens before the confirmation and why `/picks` exists.
 *
 * Order matters: `deferReply({ flags: Ephemeral })` comes first and unconditionally.
 * Discord gives an interaction 3 seconds to acknowledge, and the ephemeral flag
 * cannot be added later — not on a followup, not on an edit. `deferUpdate()` is
 * never used here: it acknowledges by editing the shared message, which has no
 * per-user copy to make ephemeral.
 *
 * The kill switch (DISC-14) is checked immediately after the defer: while
 * `DISCORD_ENABLED=false` no slate is posted and no card is locked, so a click
 * must not write a pick either. Refusing after the defer keeps the refusal
 * ephemeral and visible instead of failing the interaction.
 */
@Injectable()
export class PickHandler implements ButtonHandler {
  private readonly logger = new Logger(PickHandler.name);

  constructor(
    private readonly client: IknoballClient,
    private readonly config: DiscordConfigService,
  ) {}

  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (paused(this.config)) {
      await refusePaused(interaction);
      return;
    }

    const pick = parsePickCustomId(interaction.customId);
    if (!pick) {
      this.logger.warn(`Unparseable pick custom_id "${interaction.customId}".`);
      await interaction.editReply({ content: 'That button is not a pick I understand.' });
      return;
    }

    const side = sideName(interaction, pick.side);

    try {
      const userId = await this.resolveUserId(interaction.user.id);
      if (!userId) {
        await interaction.editReply({ content: LINK_HINT });
        return;
      }

      const previous = await this.previousSide(userId, pick.gameId);
      if (previous === pick.side) {
        // Idempotent: the same side twice changes nothing, so nothing is written
        // and the user is told rather than being sent through an upsert.
        await interaction.editReply({
          content: `Already picked: **${side}** · nothing changed · changes until tip-off`,
          components: confirmationComponents(interaction, pick.gameId),
        });
        return;
      }

      const rows = await this.client.placePick({
        userId,
        gameId: pick.gameId,
        side: pick.side,
      });

      await interaction.editReply({
        content: lockedContent(interaction, pick, rows, previous),
        components: confirmationComponents(interaction, pick.gameId),
      });
    } catch (error) {
      await this.fail(interaction, error, pick.gameId);
    }
  }

  /**
   * The Discord account's IKnoBall user, or null when it has never linked one.
   *
   * Throws `NotImplementedError` until C5 wires `resolveLink`; the caller treats
   * that like an unwired `placePick`, because without a `userId` there is nothing
   * to write either.
   */
  private async resolveUserId(discordUserId: string): Promise<string | null> {
    const { userId } = await this.client.resolveLink({ discordUserId });
    return userId;
  }

  /**
   * The side the user already had on this game, if the API can tell us.
   *
   * A read failure must never block a pick: an unwired `listPicks` (C2/C9 still
   * in flight) or a 5xx means "unknown", and the click still writes. Only the
   * errors that say something about the *user* — 404/409 — propagate, because
   * those are the unlinked-account answer.
   */
  private async previousSide(userId: string, gameId: string): Promise<OddsSide | null> {
    try {
      const picks = await this.client.listPicks({ userId });
      return picks.find((pick) => pick.gameId === gameId)?.side ?? null;
    } catch (error) {
      if (error instanceof NotImplementedError) return null;
      // 0 = never reached the API, which is as uninformative as a 5xx here.
      if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) return null;
      throw error;
    }
  }

  private async fail(
    interaction: ButtonInteraction,
    error: unknown,
    gameId: string,
  ): Promise<void> {
    if (error instanceof NotImplementedError) {
      // C2 owns `placePick` and C5 owns `resolveLink`; until either lands there
      // is nothing to save, and saying so is better than a generic failure.
      await interaction.editReply({
        content:
          'Saving is not wired up yet — that pick was not recorded. Try the website in the meantime.',
      });
      return;
    }

    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 409) {
        await interaction.editReply({ content: LINK_HINT });
        return;
      }

      if (error.status === 400) {
        await interaction.editReply({
          content: 'Picks are closed for this game — it has tipped off.',
        });
        return;
      }

      if (error.status === 429) {
        // C2 throttles per user, so this is a button-masher, not an outage.
        await interaction.editReply({
          content: 'Too many pick attempts just now. Wait a moment, then try again.',
        });
        return;
      }
    }

    this.logger.error(
      `Pick failed for game ${gameId}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );

    await interaction.editReply({
      content: `Could not save that pick. Try again, or pick on the web: ${gameWebUrl(gameId)}`,
    });
  }
}

/** The unlinked-account answer: an action the user can take, not an error. */
const LINK_HINT =
  'Link your account first: run `/link` to connect this Discord account to IKnoBall, then pick again.';

function lockedContent(
  interaction: ButtonInteraction,
  pick: PickTarget,
  rows: PickResult[],
  previous: OddsSide | null,
): string {
  const lines = [
    `Locked in: **${sideName(interaction, pick.side)}** · ${payout(rows)} · changes until tip-off`,
  ];
  // `placePick` is an upsert on (userId, gameId, mode), so a click can silently
  // replace a web pick. Saying so is the only notice either side gets.
  if (previous !== null) {
    const was = labelForSide(interaction, pick.gameId, previous);
    lines.push(
      was
        ? `Changed from your earlier pick on **${was}**.`
        : 'Changed from your earlier pick on the other side.',
    );
  }
  return lines.join('\n');
}

/**
 * The team label the card used for `side`, read back off the card's own buttons.
 *
 * The interaction carries the clicked button and the message it belongs to, and
 * the card labels its pick buttons with tricodes — so the previous side's name is
 * already in the payload. Missing (a hand-built interaction, or a card without
 * that button) is not an error: the caller falls back to "the other side".
 */
function labelForSide(
  interaction: ButtonInteraction,
  gameId: string,
  side: OddsSide,
): string | null {
  const wanted = pickCustomId(gameId, side);
  // `message.components` is typed as the API shape or the resolved shape
  // depending on whether the message was cached; both carry `customId` + `label`.
  const rows = interaction.message.components as unknown as readonly {
    components?: readonly { customId?: string; label?: string }[];
  }[];

  for (const row of rows ?? []) {
    for (const button of row.components ?? []) {
      if (button.customId === wanted && button.label) return button.label.trim();
    }
  }
  return null;
}

/** What a correct pick pays, from the weighted row `placePick` returns. */
function payout(rows: PickResult[]): string {
  const weighted = rows.find((row) => row.mode === 'weighted');
  if (!weighted) return 'points pending';
  if (weighted.lockedDecimal === null) return 'pays points once the line opens';
  return `pays ${potentialPoints('weighted', weighted.lockedDecimal)} pts if correct`;
}

/**
 * The name to use for a side. The `custom_id` carries only the game and the side,
 * so the button's own label — the tricode the card rendered — is the only team
 * name on the interaction payload.
 */
function sideName(interaction: ButtonInteraction, side: OddsSide): string {
  const { component } = interaction;
  // `APIButtonComponent` includes a SKU button variant with no label, hence the
  // `in` check rather than a plain property read.
  const label = 'label' in component ? component.label?.trim() : undefined;
  if (label) return label;
  return side === 'home' ? 'Home' : 'Away';
}

/** "Change pick" back to the card, and "Open on web" to the game page. */
function confirmationComponents(interaction: ButtonInteraction, gameId: string) {
  const components: {
    type: ComponentType.Button;
    style: ButtonStyle.Link;
    label: string;
    url: string;
  }[] = [];

  const jump = messageJumpUrl(interaction.guildId, interaction.channelId, interaction.message.id);
  if (jump)
    components.push({
      type: ComponentType.Button,
      style: ButtonStyle.Link,
      label: 'Change pick',
      url: jump,
    });

  components.push({
    type: ComponentType.Button,
    style: ButtonStyle.Link,
    label: 'Open on web',
    url: gameWebUrl(gameId),
  });

  return [{ type: ComponentType.ActionRow, components }];
}
