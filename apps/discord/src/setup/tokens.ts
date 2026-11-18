/**
 * The DI token `/setup` uses.
 *
 * It lives in a file that imports nothing, and that is the whole point.
 * `GuildConfigService` reaches `Infrastructure`, which reaches
 * `DiscordClientService` → `InteractionRouter` → the command registry →
 * `setup.command.ts`. Importing the service there as a value closes that loop, and a
 * class read before its module has finished evaluating is `undefined` when the
 * decorator metadata is built — Nest would then have nothing to inject and the bot
 * would fail to resolve `/setup` at boot.
 *
 * Naming it here lets the command declare its dependency without importing it,
 * exactly as `SLATE_STORE` and `DAY_KEY_GUARD` let the scheduler depend on an
 * interface instead of a class.
 */

/** `GuildConfigService`: the `discord_guilds` row. */
export const GUILD_CONFIG = 'GUILD_CONFIG';
