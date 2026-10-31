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
import { WEB_BASE_URL, gameWebUrl } from './web-links';

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
 *
 * The shape is deliberately lean. Every extra embed part costs body width that a
 * 432px card does not have: an author line, an 80px thumbnail, a zero-width field
 * used as a row break, and a footer all push the tip-off into a second line. What
 * is left is the matchup, when it tips off, and one field per team carrying the
 * three numbers a picker wants — season record, last five, and what the pick pays.
 *
 * Team marks never go in the `title`: Discord renders custom emoji in a title
 * inconsistently across clients, sometimes as the raw `<:MEM:123>` text. They are
 * reliable in a description, a field name, and a field value, so they live there.
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
  const fields = teamFields(teams, emojis);

  const embed: APIEmbed = {
    title: `${tricodeOf(teams.away, game.awayTricode)} @ ${tricodeOf(teams.home, game.homeTricode)}`,
    description: description(game, teams, fields.length === 0, emojis),
    ...(fields.length > 0 ? { fields } : {}),
    ...(timestamp ? { timestamp } : {}),
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

/**
 * The tip-off and any series context, in the reader's own clock.
 *
 * When the card has no fields, this is also where the matchup goes: two plain
 * tricodes in a title carry no marks, and a card with no marks at all reads as a
 * wall of text. Spending the line keeps the marks on screen in the one state that
 * would otherwise lose them.
 */
function description(
  game: CardGame,
  teams: CardTeams,
  bare: boolean,
  emojis: TeamEmojiIds,
): string {
  const unix = tipOffUnix(game.gameDateTime);
  const lines: string[] = [];

  if (bare) {
    const away = `${prefix(teams.away, emojis)}**${tricodeOf(teams.away, game.awayTricode)}**`;
    const home =
      `**${tricodeOf(teams.home, game.homeTricode)}** ${prefix(teams.home, emojis)}`.trimEnd();
    lines.push(`${away} @ ${home}`);
  }

  lines.push(unix === null ? '**Tip-off** TBD' : `**Tip-off** <t:${unix}:f> · <t:${unix}:R>`);

  const context = game.seriesText?.trim();
  if (context) lines.push(`*${context}*`);

  return lines.join('\n');
}

/**
 * One inline field per side, or none when neither side has anything to say.
 *
 * The name carries the mark, the tricode and the season record; the value carries
 * the last five results and, on the second line, what a correct pick pays. A team
 * with no record yet (October, or an opponent with no `teams` row) gets no field
 * rather than a row of dashes: an empty card is honest, a dash-filled one is noise.
 */
function teamFields(teams: CardTeams, emojis: TeamEmojiIds): APIEmbedField[] {
  return [teams.away, teams.home]
    .map((team) => teamField(team, emojis))
    .filter((field): field is APIEmbedField => field !== null);
}

function teamField(team: CardTeam, emojis: TeamEmojiIds): APIEmbedField | null {
  const points = team.points ?? null;
  const form = team.record?.form?.slice(0, 5) ?? [];
  if (!team.record && points === null) return null;

  const name = team.record
    ? `${prefix(team, emojis)}${team.tricode} · ${team.record.wins}-${team.record.losses}`
    : `${prefix(team, emojis)}${team.tricode}`;

  const lines: string[] = [];
  if (form.length > 0) lines.push(form.join(' '));
  if (points !== null) lines.push(`**+${points} pts**`);

  return {
    name,
    // An empty value is invalid on Discord's side, and a field carrying only a
    // spread of results has nothing else to say; `—` is the one placeholder left.
    value: lines.length > 0 ? lines.join('\n') : '—',
    inline: true,
  };
}

/** `'<:LAL:1> '` when there is a mark, otherwise nothing. */
function prefix(team: CardTeam, emojis: TeamEmojiIds): string {
  const mark = emojiMark(team.tricode, emojis);
  return mark ? `${mark} ` : '';
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
