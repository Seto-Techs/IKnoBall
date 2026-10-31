/**
 * The bot's invite link, as one constant.
 *
 * The id and the permission integer are the same pair documented in
 * `docs/discord-bot-listing.md`; recompute the integer from that table rather than
 * editing it here, because a missing bit fails at runtime as `Missing Permissions`
 * on the one call that needed it.
 *
 * `309237664768` is exactly five bits and nothing else:
 *
 *   View Channel          1 << 10 =     1,024
 *   Send Messages         1 << 11 =     2,048
 *   Embed Links           1 << 14 =    16,384
 *   Create Public Threads 1 << 35 = 34,359,738,368
 *   Send in Threads       1 << 38 = 274,877,906,944
 *
 * Scopes are `bot` (the bot itself) and `applications.commands` (registers the
 * slash commands, and is not a permission). The link takes whoever clicks it to
 * Discord's own server picker, where they must hold Manage Server — the bot does
 * not ask for that permission, and `/setup` checks the caller's.
 */
export const DISCORD_APPLICATION_ID = '1531941991875743744';
export const DISCORD_PERMISSIONS = '309237664768';

export const DISCORD_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_APPLICATION_ID}&permissions=${DISCORD_PERMISSIONS}&scope=bot%20applications.commands`;
