import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIEmbed,
  type APIEmbedField,
  type APIActionRowComponent,
  type APIMessageComponentEmoji,
} from 'discord.js';
import { pickCustomId } from './pick-id';
import { TEAM_EMOJI_IDS } from './team-emojis';
import type { CardGame, CardTeam, CardTeams } from './types';
import { WEB_BASE_URL, emojiImageUrl, gameWebUrl } from './web-links';

/**
 * The match card payload.
 *
 * A classic embed, not Components V2: `IS_COMPONENTS_V2` cannot be un-set on a
 * message and disables `content` and `embeds` on it, which is too rigid for a
 * first version (DISC-03).
 *
 * Pure: no client, no database, no clock. Everything that varies — the tip-off,
 * the records, the emoji ids, the web origin — is an argument, so a unit test can
 * pin the exact payload Discord will receive.
 */

export type TeamEmojiIds = typeof TEAM_EMOJI_IDS;

export interface CardOptions {
  /** Overrides the generated map, so a test can prove the emoji path. */
  emojis?: TeamEmojiIds;
  /** Points "Open on web" at a staging app instead of production. */
  webBaseUrl?: string;
}

export interface CardPayload {
  embeds: APIEmbed[];
  components: APIActionRowComponent<APIButtonComponent>[];
}

export function cardPayload(
  game: CardGame,
  teams: CardTeams,
  options: CardOptions = {},
): CardPayload {
  const emojis = options.emojis ?? TEAM_EMOJI_IDS;
  const baseUrl = options.webBaseUrl ?? WEB_BASE_URL;
  const timestamp = tipOffIso(game.gameDateTime);
  const thumbnailUrl = thumbnail(teams.home, emojis);

  const embed: APIEmbed = {
    author: { name: 'IKnoBall' },
    title: `${tricodeOf(teams.away, game.awayTricode)} @ ${tricodeOf(teams.home, game.homeTricode)}`,
    description: description(game),
    fields: [
      recordField(teams.away, 'Away', emojis),
      formField(teams.away, 'Away', emojis),
      // A non-inline field is how a classic embed starts a new row: without it
      // Discord packs the four inline fields three-then-one.
      rowBreak(),
      recordField(teams.home, 'Home', emojis),
      formField(teams.home, 'Home', emojis),
    ],
    footer: { text: `IKnoBall · ${game.id}` },
    ...(timestamp ? { timestamp } : {}),
    ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
  };

  return { embeds: [embed], components: [actionRow(game, teams, emojis, baseUrl)] };
}

/**
 * `<:LAL:123456789>` for a tricode, or undefined when the upload script has not
 * run for that team yet. A missing mark is not an error: the card falls back to
 * the plain tricode, so it renders before the emojis exist.
 */
export function emojiMark(
  tricode: string | null | undefined,
  emojis: TeamEmojiIds = TEAM_EMOJI_IDS,
): string | undefined {
  if (!tricode) return undefined;
  const id = emojis[tricode];
  return id ? `<:${tricode}:${id}>` : undefined;
}

/** The emoji object a button carries, so Discord prepends it to the label. */
function buttonEmoji(
  tricode: string | null,
  emojis: TeamEmojiIds,
): APIMessageComponentEmoji | undefined {
  if (!tricode) return undefined;
  const id = emojis[tricode];
  return id ? { id, name: tricode } : undefined;
}

function actionRow(
  game: CardGame,
  teams: CardTeams,
  emojis: TeamEmojiIds,
  baseUrl: string,
): APIActionRowComponent<APIButtonComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [
      pickButton(game, teams.away, game.awayTricode, 'away', emojis),
      pickButton(game, teams.home, game.homeTricode, 'home', emojis),
      {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: 'Open on web',
        url: gameWebUrl(game.id, baseUrl),
      },
    ],
  };
}

function pickButton(
  game: CardGame,
  team: CardTeam,
  tricode: string | null,
  side: 'away' | 'home',
  emojis: TeamEmojiIds,
): APIButtonComponent {
  const emoji = buttonEmoji(tricode, emojis);

  return {
    type: ComponentType.Button,
    // Primary, not Success: nothing about the pick is confirmed yet, and the
    // card is shared, so it must not look picked for everyone.
    style: ButtonStyle.Primary,
    custom_id: pickCustomId(game.id, side),
    label: tricodeOf(team, tricode),
    ...(emoji ? { emoji } : {}),
  };
}

/** Both the reader's clock and the countdown, in their own timezone. */
function description(game: CardGame): string {
  const unix = tipOffUnix(game.gameDateTime);
  const lines = [unix === null ? '**Tip-off** TBD' : `**Tip-off** <t:${unix}:f> · <t:${unix}:R>`];

  const context = game.seriesText?.trim();
  if (context) lines.push(`*${context}*`);

  return lines.join('\n');
}

function recordField(team: CardTeam, side: 'Away' | 'Home', emojis: TeamEmojiIds): APIEmbedField {
  return {
    name: fieldName(team, side, emojis),
    value: team.record ? `${team.record.wins}-${team.record.losses}` : '—',
    inline: true,
  };
}

function formField(team: CardTeam, side: 'Away' | 'Home', emojis: TeamEmojiIds): APIEmbedField {
  const form = team.record?.form?.slice(0, 5) ?? [];

  return {
    name: `${prefix(team, emojis)}${side} · Last 5`,
    value: form.length > 0 ? form.join(' ') : '—',
    inline: true,
  };
}

function fieldName(team: CardTeam, side: 'Away' | 'Home', emojis: TeamEmojiIds): string {
  return `${prefix(team, emojis)}${side} · ${team.tricode}`;
}

/** `'<:LAL:1> '` when there is a mark, otherwise nothing. */
function prefix(team: CardTeam, emojis: TeamEmojiIds): string {
  const mark = emojiMark(team.tricode, emojis);
  return mark ? `${mark} ` : '';
}

function rowBreak(): APIEmbedField {
  return { name: '\u200b', value: '\u200b', inline: false };
}

/** The uploaded emoji's PNG, or nothing: an SVG logo cannot be a thumbnail. */
function thumbnail(team: CardTeam, emojis: TeamEmojiIds): string | null {
  const id = emojis[team.tricode];
  return id ? emojiImageUrl(id) : null;
}

function tricodeOf(team: CardTeam, tricode: string | null): string {
  return tricode?.trim() || team.tricode.trim() || team.name;
}

/** Seconds since the epoch, or null when the feed gave us no usable time. */
function tipOffUnix(gameDateTime: string): number | null {
  const ms = Date.parse(gameDateTime);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** The embed's own timestamp, which Discord also renders in the reader's clock. */
function tipOffIso(gameDateTime: string): string | undefined {
  const ms = Date.parse(gameDateTime);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}
