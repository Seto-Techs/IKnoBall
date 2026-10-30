import { WEB_BASE_URL } from '../cards/web-links';

/**
 * The two web URLs the linking flow hands out.
 *
 * `WEB_BASE_URL` comes from `cards/web-links.ts`, which is where the app's public
 * origin already lives — a staging guild must not silently get production links
 * (DISC-03), and when C7 gives a guild its own base URL, this is the one place
 * `/link` has to change.
 */

/** `/settings/discord` — where a signed-in user links, unlinks, and sees status. */
export const LINK_PAGE_URL = `${WEB_BASE_URL}/settings/discord`;

/**
 * `/settings/discord?code=XXXXXX` — the one-click hop from `/link`.
 *
 * The code is already `[A-Z2-9]`, so encoding is belt-and-braces; a code that
 * survives a copy-paste out of Discord's markdown is the real requirement.
 */
export function linkCodeUrl(code: string): string {
  return `${LINK_PAGE_URL}?code=${encodeURIComponent(code)}`;
}
