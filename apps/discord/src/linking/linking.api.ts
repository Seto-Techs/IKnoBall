import { ApiError } from '../api/errors';
import type { ApiResponse } from '../api/types';
import type { DiscordConfigService } from '../config/discord-config.service';

/**
 * The two linking calls `IknoballClient` has no signature for.
 *
 * `IknoballClient` declares the contract the trunk pre-agreed (`resolveLink` for
 * the click path), and `apps/discord/src/api/**` is not this chunk's to extend.
 * `/link` and `/unlink` need two more calls, so they live here, next to the
 * commands that use them, and reuse `ApiError` — a caller that handles an
 * `ApiError` from `placePick` handles one from here the same way.
 *
 * Plain functions rather than an `@Injectable`: `app.module.ts` is the trunk's,
 * so a new provider could not be registered. They take the injected config and
 * are stateless.
 */

const REQUEST_TIMEOUT_MS = 5_000;

export interface IssuedLinkCode {
  code: string;
  expiresInSeconds: number;
}

export interface UnlinkResult {
  /** False when there was no `discord_links` row to delete. */
  removed: boolean;
  /** True when the bot still resolves this account through its Discord sign-in. */
  stillResolvable: boolean;
}

/** Mint a single-use code for `/link`. The API owns the alphabet and the TTL. */
export async function issueLinkCode(
  config: DiscordConfigService,
  discordUserId: string,
): Promise<IssuedLinkCode> {
  return request<IssuedLinkCode>(config, 'POST', '/internal/discord-link/code', {
    discordUserId,
  });
}

/** Delete the bot's link row for `/unlink`. */
export async function unlinkDiscord(
  config: DiscordConfigService,
  discordUserId: string,
): Promise<UnlinkResult> {
  return request<UnlinkResult>(
    config,
    'DELETE',
    `/internal/discord-link?discordUserId=${encodeURIComponent(discordUserId)}`,
  );
}

async function request<T>(
  config: DiscordConfigService,
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.apiUrl}/api${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-internal-token': config.internalApiToken,
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
    // status 0 = never reached the API, which callers treat like a 5xx.
    throw new ApiError(0, detail, path);
  } finally {
    clearTimeout(timer);
  }

  const payload = await readBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload, response), path);
  }

  return payload.data as T;
}

async function readBody(response: Response): Promise<ApiResponse<unknown>> {
  const text = await response.text();
  if (!text) return { is_success: response.ok, message: response.statusText, data: null };

  try {
    return JSON.parse(text) as ApiResponse<unknown>;
  } catch {
    return { is_success: response.ok, message: text.slice(0, 200), data: null };
  }
}

/** The API's own message when it sent one, else the HTTP status line. */
function errorMessage(payload: ApiResponse<unknown>, response: Response): string {
  const message = payload.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) return message.join('; ');
  return `${response.status} ${response.statusText}`.trim();
}
