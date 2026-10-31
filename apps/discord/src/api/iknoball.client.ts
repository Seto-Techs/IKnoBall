import { Injectable, Logger } from '@nestjs/common';
import { DiscordConfigService } from '../config/discord-config.service';
import { ApiError, NotImplementedError } from './errors';
import type {
  ApiResponse,
  HealthResult,
  LeaderboardEntry,
  LeaderboardQuery,
  ListPicksQuery,
  PickResult,
  PickWithGameResult,
  PlacePickInput,
  ResolveLinkQuery,
  ResolveLinkResult,
} from './types';

/**
 * Timeout for one internal call. Interaction handlers acknowledge first, so this
 * budget is the user's wait for the *answer*, not for the acknowledgement.
 */
const REQUEST_TIMEOUT_MS = 5_000;

type HttpMethod = 'GET' | 'POST';

/**
 * The bot → API contract.
 *
 * `IKNOBALL_API_URL` is an origin only (`http://api:3000` in the compose stack).
 * The backend sets a global `api` prefix (`apps/backend/src/main.ts`), so every
 * internal route is really `/api/internal/...` and this client is the one place
 * that knows it.
 *
 * `health()`, `placePick()` and `listPicks()` are wired up. The rest throw
 * `NotImplementedError` until the chunk that owns the endpoint fills the body in —
 * the signatures are the contract those chunks build against.
 */
@Injectable()
export class IknoballClient {
  private readonly logger = new Logger(IknoballClient.name);

  constructor(private readonly config: DiscordConfigService) {}

  async health(): Promise<HealthResult> {
    return this.request<HealthResult>('POST', '/internal/health');
  }

  /**
   * C2. Writes both modes through `PredictionsService.placePick`.
   *
   * Resolves with both rows the API wrote (`flat` then `weighted`, same side). A
   * closed pick, an unknown game, or an unknown user arrives as an `ApiError`
   * whose message the API wrote for the user, so the card can show it verbatim.
   */
  async placePick(input: PlacePickInput): Promise<PickResult[]> {
    return this.request<PickResult[]>('POST', '/internal/predictions', {
      userId: input.userId,
      gameId: input.gameId,
      side: input.side,
    });
  }

  /** C2 (endpoint) / C9 (`/picks`). */
  async listPicks(query: ListPicksQuery): Promise<PickWithGameResult[]> {
    // The endpoint returns every mode for one user, so `query.mode` is a display
    // filter for the caller; the API's query DTO does not accept one.
    return this.request<PickWithGameResult[]>(
      'GET',
      `/internal/picks?userId=${encodeURIComponent(query.userId)}`,
    );
  }

  /**
   * C8. One guild's board: top rows ranked over everyone in that server, plus the
   * caller's own row when the cut hides it.
   *
   * `guildId` is the membership key, not a filter on where picks were placed —
   * definition B in DISC-08 counts a member's web picks too.
   */
  async leaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const params = new URLSearchParams({ guildId: query.guildId, mode: query.mode });
    if (query.viewerDiscordUserId) {
      params.set('viewerDiscordUserId', query.viewerDiscordUserId);
    }

    return this.request<LeaderboardEntry[]>('GET', `/internal/leaderboard?${params.toString()}`);
  }

  /**
   * C5. `discord id → userId`, the first hop of every button click.
   *
   * The API answers `{ userId: null }` for a Discord account that has never
   * linked, which is the normal case and not an error — the handler turns it
   * into "link your account first". Only a transport or 5xx failure throws.
   */
  async resolveLink(query: ResolveLinkQuery): Promise<ResolveLinkResult> {
    return this.request<ResolveLinkResult>(
      'GET',
      `/internal/discord-link?discordUserId=${encodeURIComponent(query.discordUserId)}`,
    );
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.apiUrl}/api${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          // The shared secret. The API's InternalTokenGuard compares this in
          // constant time and fails closed when the API has none configured.
          'x-internal-token': this.config.internalApiToken,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      const detail = timedOut
        ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      this.logger.error(`API request failed: ${method} ${path}: ${detail}`);
      // status 0 = never reached the API. Callers treat it like a 5xx.
      throw new ApiError(0, detail, path);
    } finally {
      clearTimeout(timer);
    }

    const payload = await this.readBody(response);
    if (!response.ok) {
      throw new ApiError(response.status, errorMessage(payload, response), path);
    }

    return payload.data as T;
  }

  private async readBody(response: Response): Promise<ApiResponse<unknown>> {
    const text = await response.text();
    if (!text) {
      return { is_success: response.ok, message: response.statusText, data: null };
    }

    try {
      return JSON.parse(text) as ApiResponse<unknown>;
    } catch {
      // A proxy or an HTML error page. Keep a short excerpt so the log is useful.
      return { is_success: response.ok, message: text.slice(0, 200), data: null };
    }
  }
}

/** The API's own message when it sent one, else the HTTP status line. */
function errorMessage(payload: ApiResponse<unknown>, response: Response): string {
  const message = payload.message;
  if (typeof message === 'string' && message.trim()) return message;
  // Nest's ValidationPipe sends `message` as an array of constraint failures.
  if (Array.isArray(message) && message.length > 0) return message.join('; ');
  return `${response.status} ${response.statusText}`.trim();
}

export { ApiError, NotImplementedError };
