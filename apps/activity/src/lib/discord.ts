import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

/**
 * The bridge between the activity and Discord.
 *
 * Two things happen here and nowhere else: the SDK handshake that yields a
 * one-time OAuth code, and the URL mapping that makes the league's CDN
 * reachable from inside Discord's iframe. Both are browser-side; the code is
 * spent on the backend, where the client secret lives.
 */

/** Where the league's images live. Discord's CSP blocks this host directly. */
export const CDN_ORIGIN = 'https://cdn.nba.com';

/**
 * The mapping registered in the developer portal, which Discord proxies.
 * `patchUrlMappings` matches on the target host, so an absolute
 * `https://cdn.nba.com/...` URL from the API is rewritten to `/nba/...` on the
 * activity's own origin.
 *
 * The target must be a bare host with no scheme. The SDK coerces it with
 * `new URL('https://' + target)`, so passing `https://cdn.nba.com` parses to
 * host `https` and builds the regex `https(/|$)/` — which never matches, since
 * a real URL has a colon after its scheme. The mapping then silently does
 * nothing and every image stays on the host Discord's CSP blocks.
 */
export const CDN_MAPPING = { prefix: '/nba', target: new URL(CDN_ORIGIN).host };

const CLIENT_ID: string = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

/**
 * The API origin. In development the Vite proxy serves `/api` same-origin, so
 * this is empty; inside Discord the iframe lives on `discordsays.com` and the
 * API is a different origin, so `VITE_API_URL` carries it.
 *
 * Dev is pinned to the proxy rather than reading `VITE_API_URL`, the same way
 * the site does it: a developer's shell may export `VITE_API_URL` for the
 * frontend, and inheriting it here would send every call cross-origin and fail
 * CORS for no reason.
 */
const API_BASE = import.meta.env.DEV
  ? ''
  : String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** A fully-qualified API URL. Every request goes through this. */
export function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

/**
 * Whether this page is running inside Discord's iframe.
 *
 * Discord appends `frame_id` to the iframe URL and the SDK reads it during
 * `ready()`, throwing a bare "frame_id query param is not defined" when it is
 * absent. That is what anyone who opens the deployed URL directly gets — a
 * shared link, a bookmark, a curious visit — so the shell checks this first and
 * says where the app actually lives rather than showing that error.
 */
export function isInsideDiscord(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id');
}

/** What `POST /api/activity/session` hands back. */
export interface ActivitySession {
  token: string;
  discord: { id: string; name: string };
  user: { id: string; name: string; image: string | null };
}

/** Something the player can act on: shown verbatim, never swallowed. */
export class ActivityError extends Error {
  /** The API's status, when the failure came from it rather than from Discord. */
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ActivityError';
    this.status = status;
  }
}

/**
 * Ready the SDK, map the CDN, and trade Discord's code for an IKnoBall session.
 *
 * `patchSrcAttributes` is not optional. It defaults to false, and without it the
 * SDK only patches fetch/XHR/WebSocket: every `<img src>` would still point at
 * cdn.nba.com and be blocked. With it the SDK installs a MutationObserver over
 * `src` attributes and added nodes, which is what catches headshots and logos
 * that React mounts after the initial paint.
 */
export async function connectDiscord(): Promise<ActivitySession> {
  if (!CLIENT_ID) {
    throw new ActivityError(
      'VITE_DISCORD_CLIENT_ID is not set, so the activity cannot ask Discord who you are.',
    );
  }

  if (!isInsideDiscord()) {
    throw new ActivityError(
      'IKnoBall opens inside Discord. Type /iknoball in any channel to play.',
    );
  }

  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();
  patchUrlMappings([CDN_MAPPING], { patchSrcAttributes: true });

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await fetch(apiUrl('/activity/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const body = (await res.json().catch(() => null)) as {
    is_success?: boolean;
    message?: string;
    data?: ActivitySession;
  } | null;

  if (!res.ok || !body?.is_success || !body.data) {
    throw new ActivityError(
      body?.message ?? 'Discord sign-in failed. Reopen the activity and try again.',
      res.status,
    );
  }
  return body.data;
}
