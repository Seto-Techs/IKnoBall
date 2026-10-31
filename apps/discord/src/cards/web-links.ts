/**
 * The URLs a card and its buttons point at.
 *
 * One module, because a staging guild must not silently get production links
 * (DISC-03) and three call sites (the card, the pick confirmation, the "Change
 * pick" jump) have to agree.
 */

/**
 * Production web app. Pass `{ webBaseUrl }` to `cardPayload` to point a staging
 * guild somewhere else.
 */
export const WEB_BASE_URL = 'https://iknoball.setotechs.com';

/** `/game/<gameId>` — the same route the web app's game detail page uses. */
export function gameWebUrl(gameId: string, baseUrl: string = WEB_BASE_URL): string {
  return `${baseUrl}/game/${encodeURIComponent(gameId)}`;
}

/**
 * A jump link to the shared card message, for the confirmation's "Change pick"
 * button. Null in a DM: a DM message has no guild segment to link to.
 */
export function messageJumpUrl(
  guildId: string | null,
  channelId: string,
  messageId: string,
): string | null {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
