/**
 * DI tokens for the two services `/setup` uses.
 *
 * They live in a file that imports nothing, and that is the whole point.
 * `GuildConfigService` and `SlatePoster` both reach `Infrastructure`, which
 * reaches `DiscordClientService` → `InteractionRouter` → the command registry →
 * `setup.command.ts`. Importing either service there as a value closes that loop,
 * and a class read before its module has finished evaluating is `undefined` when
 * the decorator metadata is built — Nest would then have nothing to inject and
 * the bot would fail to resolve `/setup` at boot.
 *
 * Naming them here lets the command declare its dependencies without importing
 * them, exactly as `SLATE_STORE` and `DAY_KEY_GUARD` let the scheduler depend on
 * an interface instead of a class.
 */

/** `GuildConfigService`: the `discord_guilds` row. */
export const GUILD_CONFIG = 'GUILD_CONFIG';

/** `SlatePoster`: today's cards, for the no-argument preview. */
export const SLATE_POSTER = 'SLATE_POSTER';
