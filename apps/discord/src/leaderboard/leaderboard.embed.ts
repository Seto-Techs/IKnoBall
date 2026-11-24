import type { APIEmbed } from 'discord.js';
import type { PredictionMode } from '@iknoball/predictions';
import type { LeaderboardEntry } from '../api/types';

/**
 * Rows a board shows before the caller's own row is appended.
 *
 * Matches the API's cut (`GUILD_LEADERBOARD_SIZE` in
 * `apps/backend/src/internal/leaderboard.service.ts`): the endpoint returns at most
 * `BOARD_SIZE` rows, and one more only when the caller is outside them. That extra
 * row is the caller's, at its true rank. The two constants must move together — a bot
 * that trimmed while the API still returned ten would read the sixth row as the
 * caller's and label a real sixth place "Your row".
 *
 * Five, because the recap post stacks this board under a Lebronnect field and a card:
 * ten rows pushes everything else off a phone screen.
 */
export const BOARD_SIZE = 5;

const MODE_LABELS: Record<PredictionMode, string> = {
  flat: 'Flat',
  weighted: 'Weighted',
};

export interface ModeBoard {
  mode: PredictionMode;
  /** As the API returns it: the top rows, plus the caller's row when cut. */
  rows: LeaderboardEntry[];
}

export interface LeaderboardEmbedOptions {
  guildName?: string | null;
}

/**
 * The `/leaderboard` embed.
 *
 * Pure, so the exact payload Discord receives is pinned by a test. One field per
 * mode, because the two boards rank the same people by different points and a
 * reader comparing them wants them side by side.
 *
 * The description says "our members' points" on purpose: definition B ranks
 * everyone in the server by every settled pick they have made, including picks
 * made on the website. "Points earned in this server" was the definition-A label
 * and would now be false.
 */
export function leaderboardEmbed(
  boards: ModeBoard[],
  options: LeaderboardEmbedOptions = {},
): APIEmbed {
  const guildName = options.guildName?.trim();
  const where = guildName ? `**${guildName}**` : 'this server';

  return {
    author: { name: 'IKnoBall' },
    title: 'Leaderboard',
    description: `Our members' points — every settled pick by everyone in ${where}, on the website or in Discord.`,
    fields: boards.map((board) => ({
      name: `${MODE_LABELS[board.mode]} points`,
      value: fieldValue(board),
      inline: false,
    })),
    footer: { text: 'Top 5 · settled picks only' },
  };
}

/** One mode's field: the top rows, then the caller's own row when it was cut. */
function fieldValue(board: ModeBoard): string {
  const top = board.rows.slice(0, BOARD_SIZE);
  const viewer = board.rows.length > BOARD_SIZE ? board.rows[BOARD_SIZE] : undefined;

  if (top.length === 0) return 'No settled picks yet.';

  const lines = top.map(rowLine);
  // A blank line between the board and the appended row, so a viewer ranked 9th
  // is not read as sixth.
  if (viewer) lines.push('', `Your row — ${rowLine(viewer)}`);

  return lines.join('\n');
}

/**
 * One row: `3. @mira · 18 pts · 7 picks`.
 *
 * A mention rather than a bold name, so a reader can tell who is who at a glance and
 * tap through to the person. It does not notify — Discord only pings from message
 * content, never from an embed — which is what makes it safe to mention everybody on
 * a board that goes out every day. It also bounds the row: a mention is at most a
 * fixed token however long the player's name is, so five rows cannot overflow the
 * 1,024-char field.
 */
function rowLine(entry: LeaderboardEntry): string {
  return `${entry.rank}. ${who(entry)} · ${points(entry.points)} · ${picks(entry.picks)}`;
}

/** A row's owner, as the mention Discord renders as their name. */
export function who(entry: { discordUserId: string }): string {
  return `<@${entry.discordUserId}>`;
}

function points(value: number): string {
  return `${value} ${value === 1 ? 'pt' : 'pts'}`;
}

function picks(value: number): string {
  return `${value} ${value === 1 ? 'pick' : 'picks'}`;
}
