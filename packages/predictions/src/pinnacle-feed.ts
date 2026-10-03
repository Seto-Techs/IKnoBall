/**
 * Pinnacle guest (arcadia) odds feed — the NBA fallback source.
 *
 * Free and unauthenticated: the `X-API-Key` header carries Pinnacle's own
 * public front-end key, published at `https://www.pinnacle.com/config/app.json`,
 * so it is not a user secret and needs no account. This is the same endpoint
 * Pinnacle's web app calls; it is undocumented and carries no SLA, and
 * Pinnacle's official developer API has been closed to the public since
 * 2025-07-23.
 *
 * Two ways it differs from the NBA CDN feed, both load-bearing:
 *
 * - **No opening line.** Only a current price, so a deferred pick resolved from
 *   this source locks the current line rather than the opening one.
 * - **One book, not a consensus.** There is nothing to de-vig across books, so
 *   the caller de-vigs Pinnacle's own two-way price.
 *
 * Odds arrive as American integers and are converted to decimal here.
 *
 * Operational note: from some networks (notably Indonesian ISPs) every betting
 * domain is DNS-blackholed, so this host will not resolve without a
 * DNS-over-HTTPS resolver or a non-domestic egress.
 */

export const PINNACLE_ENDPOINT = 'https://guest.api.arcadia.pinnacle.com/0.1';

/**
 * Pinnacle's own public front-end key — the default `X-API-Key` for the guest
 * (arcadia) API.
 *
 * Not a secret and not a credential: it identifies the web app, not a user, and
 * Pinnacle publishes it at `https://www.pinnacle.com/config/app.json`. It is
 * kept in source so the feed works out of the box; `PINNACLE_API_KEY` overrides
 * it when the published key rotates.
 *
 * The environment is read lazily rather than at module load: the backend
 * populates `process.env` through `ConfigModule.forRoot()`, which runs after
 * this module is first evaluated, so a top-level read would always miss the
 * override there.
 */
const DEFAULT_PINNACLE_API_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R';

function pinnacleApiKey(): string {
  return process.env.PINNACLE_API_KEY || DEFAULT_PINNACLE_API_KEY;
}

/**
 * Pinnacle splits the NBA calendar across leagues, so the correct id depends on
 * the season type rather than being a single constant.
 */
export const PINNACLE_LEAGUE = {
  /** Regular season, and everything after it. */
  regular: 487,
  /** Preseason only — a separate league on Pinnacle. */
  preseason: 5270,
} as const;

/** NBA game ids encode the season type in their first three digits. */
const PRESEASON_GAME_ID_PREFIX = '001';

/**
 * Pinnacle league for an NBA game id.
 *
 * NBA ids start `001` for preseason and `002` for the regular season (`003`
 * all-star, `004` playoffs, `005` play-in beyond that). Preseason is priced
 * under its own league; everything else lives under the main NBA league.
 */
export function pinnacleLeagueForGameId(gameId: string): number {
  return gameId.startsWith(PRESEASON_GAME_ID_PREFIX)
    ? PINNACLE_LEAGUE.preseason
    : PINNACLE_LEAGUE.regular;
}

/**
 * Book identity recorded alongside a price.
 *
 * Pinnacle is licensed in Curaçao and this feed carries a single price, so the
 * book name is a constant rather than something read from the payload.
 */
export const PINNACLE_BOOK = {
  bookId: 'pinnacle',
  bookName: 'Pinnacle',
  countryCode: 'CW',
} as const;

export interface PinnacleMatchup {
  matchupId: number;
  startTime: string | null;
  homeTeamName: string;
  awayTeamName: string;
}

export interface PinnacleGame extends PinnacleMatchup {
  /** Decimal odds, converted from Pinnacle's American integers. */
  home: number;
  away: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * American moneyline to decimal.
 *
 * Positive prices pay that much profit on 100 (`+150` → 2.50); negative prices
 * are the stake needed to win 100 (`-200` → 1.50). Returns null for anything
 * that cannot be a price, so a malformed leg is dropped rather than scored.
 */
export function americanToDecimal(american: number | null): number | null {
  if (american === null || !Number.isFinite(american) || american === 0) return null;
  const decimal = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  return decimal > 1 ? decimal : null;
}

/**
 * Games from a matchups payload, keyed by the team pair.
 *
 * Entries that are not two-team games (props, yes/no specials) are dropped:
 * they have no home/away alignment, so they cannot be priced as a moneyline.
 */
export function parsePinnacleMatchups(raw: unknown): PinnacleMatchup[] {
  if (!Array.isArray(raw)) return [];

  const matchups: PinnacleMatchup[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;

    const matchupId = toPositiveInt(entry.id);
    if (matchupId === null) continue;

    const participants = Array.isArray(entry.participants) ? entry.participants : [];
    let home: string | null = null;
    let away: string | null = null;

    for (const participant of participants) {
      if (!isRecord(participant)) continue;
      const name = toText(participant.name);
      if (!name) continue;
      if (participant.alignment === 'home' && home === null) home = name;
      else if (participant.alignment === 'away' && away === null) away = name;
    }

    if (!home || !away) continue;
    matchups.push({
      matchupId,
      startTime: toText(entry.startTime),
      homeTeamName: home,
      awayTeamName: away,
    });
  }

  return matchups;
}

/**
 * Full-game moneylines from a markets payload, keyed by matchup id.
 *
 * Only `moneyline` at period 0 counts — the same payload carries spreads,
 * totals, team totals and per-half markets, and a period-1 moneyline is a
 * half-time market, not the game.
 */
export function parsePinnacleMoneylines(raw: unknown): Map<number, { home: number; away: number }> {
  const prices = new Map<number, { home: number; away: number }>();
  if (!Array.isArray(raw)) return prices;

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (entry.type !== 'moneyline' || entry.period !== 0) continue;

    const matchupId = toPositiveInt(entry.matchupId);
    if (matchupId === null) continue;

    const legs = Array.isArray(entry.prices) ? entry.prices : [];
    let home: number | null = null;
    let away: number | null = null;

    for (const leg of legs) {
      if (!isRecord(leg)) continue;
      const decimal = americanToDecimal(toNumber(leg.price));
      if (decimal === null) continue;
      // Real-game moneylines label sides `designation`; prop markets use
      // `participantId` instead, which is how they fall out here.
      if (leg.designation === 'home' && home === null) home = decimal;
      else if (leg.designation === 'away' && away === null) away = decimal;
    }

    if (home === null || away === null) continue;
    prices.set(matchupId, { home, away });
  }

  return prices;
}

/**
 * Join a league's matchups to its moneylines.
 *
 * Exported for tests: it is the whole of the parsing logic, and the two HTTP
 * calls that feed it are the only part that needs a network.
 */
export function joinPinnaclePayload(matchupsRaw: unknown, marketsRaw: unknown): PinnacleGame[] {
  const moneylines = parsePinnacleMoneylines(marketsRaw);

  const games: PinnacleGame[] = [];
  for (const matchup of parsePinnacleMatchups(matchupsRaw)) {
    const price = moneylines.get(matchup.matchupId);
    if (!price) continue;
    games.push({ ...matchup, home: price.home, away: price.away });
  }

  return games;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': pinnacleApiKey(),
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Pinnacle request failed: ${response.status} ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Every priced game in one Pinnacle league.
 *
 * Two requests: the matchup list (team names, tip-off) and every market for the
 * league, which are joined on matchup id. Throws on a non-OK response so the
 * caller can fall through to the next source.
 */
export async function fetchPinnacleLeague(
  leagueId: number,
  timeoutMs = 15000,
): Promise<PinnacleGame[]> {
  const base = `${PINNACLE_ENDPOINT}/leagues/${leagueId}`;
  const [matchups, markets] = await Promise.all([
    // `withSpecials=false` is required, not cosmetic: without it the same call
    // returns ~8x the entries, almost all prop and yes/no specials.
    fetchJson(`${base}/matchups?withSpecials=false`, timeoutMs),
    fetchJson(`${base}/markets/straight`, timeoutMs),
  ]);

  return joinPinnaclePayload(matchups, markets);
}

/** Priced games across several leagues, fetched concurrently. */
export async function fetchPinnacleOdds(
  leagueIds: number[],
  timeoutMs = 15000,
): Promise<PinnacleGame[]> {
  const perLeague = await Promise.all(
    leagueIds.map((leagueId) => fetchPinnacleLeague(leagueId, timeoutMs)),
  );
  return perLeague.flat();
}

/**
 * Pinnacle team name → NBA team id, built from `teams` rows.
 *
 * Pinnacle identifies teams by name, so every consumer needs this index to turn
 * a matchup into the team ids the rest of the app keys on.
 */
export function indexTeamIds(
  rows: Array<{ fullName: string; externalId: string }>,
): Map<string, number> {
  const byName = new Map<string, number>();
  for (const row of rows) {
    const id = Number(row.externalId);
    if (Number.isFinite(id)) byName.set(row.fullName, id);
  }
  return byName;
}

/**
 * The Pinnacle game matching an NBA team pair, or null when it is not priced.
 *
 * Matching is on the team pair rather than an id because Pinnacle carries no
 * NBA game id.
 */
export function findPinnacleGame(
  games: PinnacleGame[],
  teamIds: Map<string, number>,
  homeTeamId: number,
  awayTeamId: number,
): PinnacleGame | null {
  for (const game of games) {
    if (
      teamIds.get(game.homeTeamName) === homeTeamId &&
      teamIds.get(game.awayTeamName) === awayTeamId
    ) {
      return game;
    }
  }
  return null;
}
