/**
 * NBA CDN odds feed — the undocumented file the NBA's own site reads.
 *
 * Free, unauthenticated, no SLA. The payload is inconsistent: entries randomly
 * omit `gameId`, team ids, `odds_trend`, and `spread`, and the same book can
 * appear twice under different country codes. Parsing therefore drops anything
 * it cannot price rather than throwing.
 *
 * Shared by the worker (which polls and persists) and the backend (which
 * refreshes on demand), so both parse the feed identically.
 */

export const ODDS_ENDPOINT = 'https://cdn.nba.com/static/json/liveData/odds/odds_todaysGames.json';

/** Moneyline market name. Spreads are `odds_type_id: 4`; there is no totals market. */
const MONEYLINE_MARKET = '2way';

/** One book's two-way moneyline for a game. Odds are decimal, as published. */
export interface OddsBook {
  bookId: string;
  bookName: string;
  countryCode: string;
  home: number;
  away: number;
  homeOpening: number | null;
  awayOpening: number | null;
}

export interface OddsGame {
  /** Present on some captures only. Callers resolve it from the team ids otherwise. */
  gameId: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  books: OddsBook[];
}

/** Seam for swapping in a commercial feed without touching callers. */
export interface OddsProvider {
  fetchMoneyline(): Promise<OddsGame[]>;
}

/**
 * Browser-shaped headers.
 *
 * Akamai rejects requests to cdn.nba.com that do not look like they come from
 * the NBA's own site. The header set is the gate, not the client: `Referer` is
 * required and its value must be an nba.com origin, and the `Sec-Fetch-*` set
 * must be present too. Node's fetch (undici) and Bun's fetch are both served the
 * file with this full set; sending `Referer` alone is not enough for Bun. curl
 * is rejected regardless, on TLS/HTTP fingerprint. Verified 2026-10-03 — see
 * `docs/prediction-scoring.md` for the isolation matrix.
 */
export function oddsHeaders(): Record<string, string> {
  return {
    Host: 'cdn.nba.com',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    Referer: 'https://www.nba.com/',
    Origin: 'https://www.nba.com',
    'Sec-GPC': '1',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    Priority: 'u=4',
    TE: 'trailers',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decimal odds are always greater than 1; anything else is feed noise. */
function toDecimal(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 1) return null;
  return parsed;
}

function toTeamId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parseBook(entry: unknown): OddsBook | null {
  if (!isRecord(entry)) return null;

  const bookId = toText(entry.id);
  const bookName = toText(entry.name);
  const countryCode = toText(entry.countryCode);
  if (!bookId || !bookName || !countryCode) return null;

  const outcomes = Array.isArray(entry.outcomes) ? entry.outcomes : [];
  let home: number | null = null;
  let away: number | null = null;
  let homeOpening: number | null = null;
  let awayOpening: number | null = null;

  for (const outcome of outcomes) {
    if (!isRecord(outcome)) continue;
    const decimal = toDecimal(outcome.odds);
    if (decimal === null) continue;

    if (outcome.type === 'home' && home === null) {
      home = decimal;
      homeOpening = toDecimal(outcome.opening_odds);
    } else if (outcome.type === 'away' && away === null) {
      away = decimal;
      awayOpening = toDecimal(outcome.opening_odds);
    }
  }

  // A book missing either side cannot price a two-way market.
  if (home === null || away === null) return null;

  return { bookId, bookName, countryCode, home, away, homeOpening, awayOpening };
}

/** Normalise the CDN payload into moneyline books, dropping what cannot be priced. */
export function parseOddsPayload(raw: unknown): OddsGame[] {
  if (!isRecord(raw)) return [];
  const entries = Array.isArray(raw.games) ? raw.games : [];

  const games: OddsGame[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    const markets = Array.isArray(entry.markets) ? entry.markets : [];
    const moneyline = markets.find(
      (market) => isRecord(market) && market.name === MONEYLINE_MARKET,
    );
    if (!isRecord(moneyline)) continue;

    const bookEntries = Array.isArray(moneyline.books) ? moneyline.books : [];
    const seen = new Set<string>();
    const books: OddsBook[] = [];
    for (const bookEntry of bookEntries) {
      const book = parseBook(bookEntry);
      if (!book) continue;
      // The same book can appear twice under different country codes (e.g.
      // Novibet GR and CY) with identical odds. Keep one row per book+country.
      const key = `${book.bookId}:${book.countryCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      books.push(book);
    }

    if (!books.length) continue;

    games.push({
      gameId: toText(entry.gameId),
      homeTeamId: toTeamId(entry.homeTeamId),
      awayTeamId: toTeamId(entry.awayTeamId),
      books,
    });
  }

  return games;
}

/** Fetch and parse the feed. Throws on a non-OK response so callers can fall back. */
export async function fetchNbaOdds(timeoutMs = 15000): Promise<OddsGame[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ODDS_ENDPOINT, {
      method: 'GET',
      headers: oddsHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CDN odds request failed: ${response.status}`);
    }

    return parseOddsPayload(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pick the price to score against.
 *
 * A game is often priced by only one book, so this falls back to whatever is
 * present rather than failing when the preferred book is missing.
 */
export function pickBook(books: OddsBook[], preferredBook: string): OddsBook | null {
  if (!books.length) return null;
  return books.find((book) => book.bookName === preferredBook) ?? books[0];
}
