import { apiGet, apiPost } from './api';
import { CDN_ORIGIN } from './discord';

/**
 * Lebronnect's API surface, ported from the site.
 *
 * Validation and grading stay on the server: the client is a renderer, and a
 * chain it made up is worth nothing until the graph agrees with it. The one
 * thing no response contains is the shortest route, except with an over-par
 * solve — `par` arrives with a finished solve and nowhere else.
 */

export type ConnectPlayer = {
  id: string;
  /** NBA person id, which is what the headshot CDN keys on. */
  externalId: string;
  name: string;
};

export type PlayerSuggestion = ConnectPlayer & { seasons: string };

export type Receipt = { team: string; seasons: string[] };

/** One row of the chain as the client holds it. `receipt` is empty on the start. */
export type ChainLink = ConnectPlayer & { receipt: Receipt[] };

export type LebronnectPuzzle = {
  number: number;
  date: string;
  start: ConnectPlayer;
  target: ConnectPlayer;
};

export type LebronnectGrade = 1 | 2 | 3 | 4 | 5;

export type ResultChainLink = {
  playerId: string;
  externalId: string;
  name: string;
  receipt: Receipt[];
};

export type LebronnectResult = {
  date: string;
  number: number;
  /** Intermediaries named. The start and the target never count. */
  players: number;
  par: number;
  blocks: LebronnectGrade;
  perfect: boolean;
  chain: ResultChainLink[];
  /** The shortest route, only when the chain finished over par. */
  best: ResultChainLink[] | null;
};

export type LebronnectHistoryRow = {
  number: number;
  date: string;
  start: ConnectPlayer;
  target: ConnectPlayer;
  players: number;
  par: number;
  blocks: LebronnectGrade;
};

export type LebronnectStats = {
  streak: number;
  solved: number;
  average: number;
  results: LebronnectHistoryRow[];
};

export type LebronnectMe = {
  result: LebronnectResult | null;
  stats: LebronnectStats;
};

/** Headshots come off the league CDN. The URL mapping rewrites the host inside Discord. */
export function headshotUrl(externalId: string): string {
  return `${CDN_ORIGIN}/headshots/nba/latest/1040x760/${externalId}.png`;
}

/* ── Calls ─────────────────────────────────────────────────────
 * The same four endpoints the site's game uses, so the activity and the web
 * board are the same game rather than two boards that look alike.
 */

export function fetchPuzzle(): Promise<LebronnectPuzzle> {
  return apiGet<LebronnectPuzzle>('/minigames/lebronnect/puzzle');
}

export function fetchLebronnectMe(): Promise<LebronnectMe> {
  return apiGet<LebronnectMe>('/minigames/lebronnect/me');
}

/** Two characters is the floor: one letter matches the whole league. */
export function searchPlayers(query: string): Promise<PlayerSuggestion[]> {
  if (query.trim().length < 2) return Promise.resolve([]);
  return apiGet<PlayerSuggestion[]>(
    `/minigames/lebronnect/players?q=${encodeURIComponent(query.trim())}`,
  );
}

/** Whether two players shared a team-season, and the receipts that prove it. */
export function checkHop(
  from: string,
  to: string,
): Promise<{ linked: boolean; receipt: Receipt[] }> {
  return apiPost<{ linked: boolean; receipt: Receipt[] }>('/minigames/lebronnect/hop', {
    from,
    to,
  });
}

/** Submit a finished chain. The server re-checks every hop and grades it. */
export function solveChain(chain: string[]): Promise<LebronnectResult> {
  return apiPost<LebronnectResult>('/minigames/lebronnect/solve', { chain });
}

/** `1 player` / `2 players`. */
export function playerLabel(players: number) {
  return `${players} ${players === 1 ? 'player' : 'players'}`;
}

/* ── Chain in progress ─────────────────────────────────────────
 * The chain lives in component state, so a reload loses it, and the server only
 * keeps a record once the day is solved. An unfinished chain has no other home,
 * so it is kept in localStorage under the viewer's id and the board's date.
 *
 * What comes back out is untrusted: a hand-edited value or a truncated write
 * reaches `seasonRun` and throws inside the chain, taking the whole board down.
 * It is checked down to the fields the chain renders, and a record that fails is
 * dropped rather than rendered, so the worst case is starting the day over.
 */

const PROGRESS_KEY_PREFIX = 'iknoball.lebronnect.chain.v1';

function progressKey(userId: string, date: string): string {
  return `${PROGRESS_KEY_PREFIX}:${userId}:${date}`;
}

function isStoredReceipt(value: unknown): value is Receipt {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.team === 'string' &&
    Array.isArray(row.seasons) &&
    row.seasons.every((season) => typeof season === 'string')
  );
}

function isStoredLink(value: unknown): value is ChainLink {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.id === 'string' &&
    typeof link.externalId === 'string' &&
    typeof link.name === 'string' &&
    Array.isArray(link.receipt) &&
    link.receipt.every(isStoredReceipt)
  );
}

function isStoredChain(value: unknown, startId: string): value is ChainLink[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    isStoredLink(value[0]) &&
    value[0].id === startId &&
    value.every(isStoredLink)
  );
}

export function readChainProgress(
  userId: string,
  date: string,
  startId: string,
): ChainLink[] | null {
  const key = progressKey(userId, date);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isStoredChain(parsed, startId)) return parsed;
    window.localStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

export function writeChainProgress(userId: string, date: string, chain: ChainLink[]): void {
  try {
    window.localStorage.setItem(progressKey(userId, date), JSON.stringify(chain));
  } catch {
    // Storage unavailable or full: the chain simply will not survive a reload.
  }
}

export function clearChainProgress(userId: string, date: string): void {
  try {
    window.localStorage.removeItem(progressKey(userId, date));
  } catch {
    // Nothing to do: a record that cannot be read is never rendered.
  }
}
