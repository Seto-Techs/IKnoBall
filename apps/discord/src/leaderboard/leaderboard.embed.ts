import type { APIEmbed } from 'discord.js';
import type { PredictionMode } from '@iknoball/predictions';
import type { LeaderboardEntry } from '../api/types';

/**
 * Rows a board shows before the caller's own row is appended.
 *
 * Matches the API's cut: the endpoint returns at most `BOARD_SIZE` rows, and an
 * eleventh only when the caller is outside them. That eleventh row is the
 * caller's, at its true rank.
 */
export const BOARD_SIZE = 10;

/** Longest name rendered in a row, so ten rows cannot overflow a 1,024-char field. */
const MAX_NAME_LENGTH = 24;

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
    footer: { text: 'Top 10 · settled picks only' },
  };
}

/** One mode's field: the top rows, then the caller's own row when it was cut. */
function fieldValue(board: ModeBoard): string {
  const top = board.rows.slice(0, BOARD_SIZE);
  const viewer = board.rows.length > BOARD_SIZE ? board.rows[BOARD_SIZE] : undefined;

  if (top.length === 0) return 'No settled picks yet.';

  const lines = top.map(rowLine);
  // A blank line between the board and the appended row, so a viewer ranked 12th
  // is not read as eleventh.
  if (viewer) lines.push('', `Your row — ${rowLine(viewer)}`);

  return lines.join('\n');
}

function rowLine(entry: LeaderboardEntry): string {
  return `${entry.rank}. **${truncate(entry.name)}** · ${points(entry.points)} · ${picks(entry.picks)}`;
}

function points(value: number): string {
  return `${value} ${value === 1 ? 'pt' : 'pts'}`;
}

function picks(value: number): string {
  return `${value} ${value === 1 ? 'pick' : 'picks'}`;
}

function truncate(name: string): string {
  const trimmed = name.trim() || 'Unknown player';
  return trimmed.length > MAX_NAME_LENGTH ? `${trimmed.slice(0, MAX_NAME_LENGTH - 1)}…` : trimmed;
}
