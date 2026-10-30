import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIActionRowComponent,
  type APIEmbed,
} from 'discord.js';
import { potentialPoints, type PredictionMode } from '@iknoball/predictions';
import type { PickWithGameResult } from '../api/types';
import { WEB_BASE_URL } from '../cards/web-links';

/**
 * The `/picks` reply, built from `GET /internal/picks`.
 *
 * Pure, like `cardPayload`: no client, no database, and the clock is an argument.
 * The command is ephemeral and rebuilds this on every call, so there is nothing
 * to keep in sync — which is exactly why it reads the same rows the web's My
 * Picks reads instead of keeping its own copy.
 *
 * One *row* here is one game, not one API row: a single submit writes a flat and
 * a weighted pick on the same side (see `docs/prediction-scoring.md`), so both
 * modes share a line and the ten-row cap counts games.
 */

/** `schedule_games.gameStatus`: 1 scheduled, 2 live, 3 final (same as the backend). */
const STATUS_SCHEDULED = 1;

/** Hard cap on pick lines, by choice: a season is unreadable in an embed. */
const MAX_ROWS = 10;

/** How many settled picks the reply shows when there is room for them. */
const SETTLED_ROWS = 5;

/** Flat first, so a line reads the same however the API ordered the two rows. */
const MODES: readonly PredictionMode[] = ['flat', 'weighted'];

export interface PicksPayloadOptions {
  /** Display filter only: the endpoint returns every mode for the user. */
  mode?: PredictionMode | null;
  /** Clock for "can it still change". Passed in so a test can pin it. */
  now?: number;
  /** Points "See all on the web" at a staging app instead of production. */
  webBaseUrl?: string;
}

export interface PicksPayload {
  /** Set only for the empty states, which read better as plain text. */
  content?: string;
  embeds: APIEmbed[];
  components: APIActionRowComponent<APIButtonComponent>[];
}

/** The web app's My Picks tab (`apps/frontend/src/routes/predict.tsx`). */
export function picksWebUrl(baseUrl: string = WEB_BASE_URL): string {
  return `${baseUrl}/predict`;
}

export function picksPayload(
  picks: PickWithGameResult[],
  options: PicksPayloadOptions = {},
): PicksPayload {
  const now = options.now ?? Date.now();
  const baseUrl = options.webBaseUrl ?? WEB_BASE_URL;
  const mode = options.mode ?? null;
  const visible = mode ? picks.filter((pick) => pick.mode === mode) : picks;

  const lines = groupByGame(visible);
  const open = lines.filter(isOpen).sort(byTipOff);
  // Every settled line, newest first: the reply shows five, but the notice counts
  // from here, so a long history still says how much is behind the web link.
  const settled = lines.filter((line) => !isOpen(line)).sort(bySettledAt);

  const components = webRow(picksWebUrl(baseUrl));

  if (open.length === 0 && settled.length === 0) {
    return { content: emptyContent(mode), embeds: [], components };
  }

  // Open picks come first and take as many rows as they need; the results fill
  // whatever is left of the ten, and five at most. The notice says what did not fit.
  const shownOpen = open.slice(0, MAX_ROWS);
  const shownSettled = settled.slice(0, Math.min(SETTLED_ROWS, MAX_ROWS - shownOpen.length));

  const body: string[] = [];
  if (shownOpen.length > 0) {
    body.push('**Open picks**');
    for (const line of shownOpen) body.push(openLine(line, now));
  }
  if (shownSettled.length > 0) {
    if (body.length > 0) body.push('');
    body.push('**Recently settled**');
    for (const line of shownSettled) body.push(settledLine(line));
  }

  const notice = hiddenNotice(open.length - shownOpen.length, settled.length - shownSettled.length);
  if (notice) body.push('', notice);

  const embed: APIEmbed = {
    author: { name: 'IKnoBall' },
    title: mode ? `Your picks · ${mode}` : 'Your picks',
    description: body.join('\n'),
  };

  return { embeds: [embed], components };
}

/** One game's pick, with its flat and weighted rows together. */
interface PickLine {
  gameId: string;
  rows: PickWithGameResult[];
}

function groupByGame(picks: PickWithGameResult[]): PickLine[] {
  const byGame = new Map<string, PickWithGameResult[]>();
  for (const pick of picks) {
    const rows = byGame.get(pick.gameId);
    if (rows) rows.push(pick);
    else byGame.set(pick.gameId, [pick]);
  }

  return [...byGame].map(([gameId, rows]) => ({
    gameId,
    rows: [...rows].sort((a, b) => MODES.indexOf(a.mode) - MODES.indexOf(b.mode)),
  }));
}

/** A line is open while any of its modes is still pending settlement. */
function isOpen(line: PickLine): boolean {
  return line.rows.some((row) => row.status === 'pending');
}

/**
 * Whether the user can still change this pick, using the API's own cutoff
 * (`PredictionsService.requireOpenGame`): the game must be scheduled and the
 * tip-off must not have passed. A pick whose schedule row was dropped has no
 * tip-off and is locked, which is right — it is waiting to be voided.
 */
function canStillChange(row: PickWithGameResult, now: number): boolean {
  if (row.gameStatus !== STATUS_SCHEDULED) return false;
  const tipOff = timeOf(row.gameDateTime);
  return tipOff !== null && tipOff > now;
}

/** Soonest tip-off first: those are the picks about to lock. */
function byTipOff(a: PickLine, b: PickLine): number {
  const at = timeOf(a.rows[0].gameDateTime) ?? Number.POSITIVE_INFINITY;
  const bt = timeOf(b.rows[0].gameDateTime) ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.gameId.localeCompare(b.gameId);
}

/** Most recently settled first. */
function bySettledAt(a: PickLine, b: PickLine): number {
  const at = settledAtOf(a) ?? Number.NEGATIVE_INFINITY;
  const bt = settledAtOf(b) ?? Number.NEGATIVE_INFINITY;
  if (at !== bt) return at > bt ? -1 : 1;
  return a.gameId.localeCompare(b.gameId);
}

function settledAtOf(line: PickLine): number | null {
  for (const row of line.rows) {
    const settled = timeOf(row.settledAt);
    if (settled !== null) return settled;
  }
  return null;
}

function openLine(line: PickLine, now: number): string {
  const [first] = line.rows;
  const parts = [matchup(line), tipOffText(first)];
  parts.push(canStillChange(first, now) ? 'changes until tip-off' : 'locked');
  parts.push(pointsText(line.rows));
  return parts.join(' · ');
}

function settledLine(line: PickLine): string {
  return `${resultMark(line)} ${matchup(line)} · ${pointsText(line.rows)}`;
}

/**
 * ✅ / ❌ / ➖ for a settled line.
 *
 * A voided pick is neither: it pays nothing either way, so it gets its own mark
 * rather than being counted as a loss. Both modes share a side, so a win is a win
 * in whichever mode scored.
 */
function resultMark(line: PickLine): string {
  const scored = line.rows.filter((row) => row.status === 'settled');
  if (scored.length === 0) return '➖';
  return scored.some((row) => (row.points ?? 0) > 0) ? '✅' : '❌';
}

/**
 * Points for one line, per mode.
 *
 * A weighted pick that is still waiting for the opening line has no score to
 * show and must not read as zero — the payout is a function of the price, so
 * "pending" is the honest answer. A voided mode says so instead of scoring 0.
 */
function pointsText(rows: PickWithGameResult[]): string {
  if (rows.every((row) => row.status === 'voided')) return 'voided — no points either way';
  return rows.map(pointPart).join(' · ');
}

function pointPart(row: PickWithGameResult): string {
  if (row.status === 'voided') return `${row.mode} voided`;

  if (row.status === 'settled') {
    return row.points === null
      ? `${row.mode} points pending`
      : `${formatPoints(row.points)} (${row.mode})`;
  }

  if (row.pendingPrice || (row.mode === 'weighted' && row.lockedDecimal === null)) {
    // Nothing to project from without a locked price: the payout is a function of
    // it, so 0 would be a lie. `pendingPrice` is the API's flag for exactly this;
    // the price check is the same condition, in case a caller builds a row itself.
    return `${row.mode} points pending until the line opens`;
  }

  return `${formatPoints(potentialPoints(row.mode, row.lockedDecimal))} (${row.mode}) if correct`;
}

/** `MEM @ **DAL**` — the card's away-at-home order, picked side in bold. */
function matchup(line: PickLine): string {
  const [first] = line.rows;
  if (!hasTeams(first)) return `Game ${first.gameId}`;

  const away = teamLabel(first.awayTricode, first.awayTeam, 'Away');
  const home = teamLabel(first.homeTricode, first.homeTeam, 'Home');
  return first.side === 'home' ? `${away} @ **${home}**` : `**${away}** @ ${home}`;
}

function hasTeams(row: PickWithGameResult): boolean {
  return Boolean(row.awayTricode ?? row.awayTeam ?? row.homeTricode ?? row.homeTeam);
}

function teamLabel(tricode: string | null, name: string | null, fallback: string): string {
  return tricode?.trim() || name?.trim() || fallback;
}

/** `<t:UNIX:R>`, which Discord renders as a countdown in the reader's timezone. */
function tipOffText(row: PickWithGameResult): string {
  const tipOff = timeOf(row.gameDateTime);
  if (tipOff === null) return 'tip-off TBD';
  return `<t:${Math.floor(tipOff / 1000)}:R>`;
}

/** Milliseconds, or null when the API gave us no usable time. */
function timeOf(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** `1 pt` / `20 pts`, matching the web's own formatting. */
function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}

function hiddenNotice(open: number, settled: number): string | null {
  const parts: string[] = [];
  if (open > 0) parts.push(`${open} more open pick${open === 1 ? '' : 's'}`);
  if (settled > 0) parts.push(`${settled} more result${settled === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return `*…and ${parts.join(' and ')}. See all on the web.*`;
}

function emptyContent(mode: PredictionMode | null): string {
  if (mode) {
    return `No **${mode}** picks yet. Run \`/picks\` without a mode to see the other board.`;
  }
  return 'No picks yet. Use a pick button on a game card, or open the slate on the web.';
}

function webRow(url: string): APIActionRowComponent<APIButtonComponent>[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Link,
          label: 'See all on the web',
          url,
        },
      ],
    },
  ];
}
