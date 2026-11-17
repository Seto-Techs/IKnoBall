import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from './discord';

/* ── Transport ─────────────────────────────────────────────────
 * One wrapper, because every screen needs the same three things: the bearer
 * token, the API's `{ is_success, message, data }` envelope unwrapped, and a
 * message worth showing when it says no. The activity has no cookie session to
 * fall back on — the token is the whole identity.
 */

let bearer: string | null = null;

export function setBearer(token: string | null) {
  bearer = token;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface Envelope<T> {
  is_success?: boolean;
  message?: string;
  data?: T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !payload?.is_success) {
    throw new ApiError(payload?.message ?? `That request failed (${res.status}).`, res.status);
  }
  return payload.data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

/** A thrown value, as a sentence a player can read. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong.';
}

/* ── Shapes the API returns ──────────────────────────────────── */

export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTricode: string;
  awayTricode: string;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTime: string;
  /** Schedule text: `7:00 pm ET`, `Final`, `Q3 4:12`. */
  status: string;
  gameDate: string;
}

export type PickSide = 'home' | 'away';
export type PredictionMode = 'flat' | 'weighted';
export type PickStatus = 'pending' | 'settled' | 'void';

export interface Pick {
  gameId: string;
  mode: PredictionMode;
  side: PickSide;
  lockedDecimal: number | null;
  lockedBook: string | null;
  lockedAt: string | null;
  points: number | null;
  status: PickStatus;
  settledAt: string | null;
  pendingPrice: boolean;
  gameDateTime: string | null;
  /** 1 scheduled, 2 live, 3 final. */
  gameStatus: number | null;
}

export interface OddsSide {
  decimal: number;
  flat: number;
  weighted: number;
}

export interface OddsPreview {
  gameId: string;
  available: boolean;
  stale: boolean;
  home: OddsSide | null;
  away: OddsSide | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  points: number;
  picks: number;
  correct: number;
}

export interface Standing {
  rank: number;
  teamAbbr: string;
  wins: number;
  losses: number;
}

export interface Standings {
  season: string;
  West: Standing[];
  East: Standing[];
}

export interface Team {
  abbreviation: string;
  teamName: string;
  fullName: string;
  city: string;
  logoUrl: string;
  primaryColor: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
  isVerified: boolean;
  favoriteTeam: string | null;
  favoriteTeamColor: string | null;
}

/* ── Calls ───────────────────────────────────────────────────── */

export function fetchSlate(date: string): Promise<Game[]> {
  return apiGet<Game[]>(`/games/range?from=${date}&to=${date}`);
}

export function fetchPicks(): Promise<Pick[]> {
  return apiGet<Pick[]>('/predictions/me');
}

export function placePick(gameId: string, side: PickSide): Promise<Pick[]> {
  return apiPost<Pick[]>('/predictions', { gameId, side });
}

export function removePick(gameId: string): Promise<{ gameId: string }> {
  return apiDelete<{ gameId: string }>(`/predictions/${gameId}`);
}

export function fetchOdds(gameId: string): Promise<OddsPreview> {
  return apiGet<OddsPreview>(`/predictions/odds/${gameId}`);
}

export function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  return apiGet<LeaderboardRow[]>('/predictions/leaderboard?mode=flat');
}

export function fetchStandings(): Promise<Standings> {
  return apiGet<Standings>('/standings');
}

export function fetchTeams(): Promise<Team[]> {
  return apiGet<Team[]>('/teams');
}

export function fetchMe(): Promise<Me> {
  return apiGet<Me>('/me');
}

export function setFavoriteTeam(teamAbbr: string): Promise<Me> {
  return apiPatch<Me>('/me/team', { teamAbbr });
}

/* ── One request, as component state ───────────────────────────
 * The activity has no router and no cache library: each screen loads what it
 * renders once, and `reload` is what a mutation calls afterwards. `key` re-runs
 * the load when the thing it depends on changes. A response that lands after the
 * screen is gone is dropped rather than written into an unmounted component.
 */

export interface Resource<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useResource<T>(load: () => Promise<T>, key = ''): Resource<T> {
  const [state, setState] = useState<{ data?: T; error: string | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loadRef
      .current()
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (alive) setState({ data: undefined, error: messageOf(error), loading: false });
      });
    return () => {
      alive = false;
    };
    // `key` names what the load depends on — a date, a set of ids — and `nonce`
    // is the reload trigger. Both are listed statically; the caller's load
    // closure is read through a ref so it never needs to be a dependency.
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
