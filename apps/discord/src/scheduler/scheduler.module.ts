import { Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DiscordConfigModule } from '../config/config.module';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { GuildConfigService } from '../setup/guild-config.service';
import { GuildLifecycle } from '../setup/guild-lifecycle';
import { GUILD_CONFIG } from '../setup/tokens';
import { BoardRepository } from './board-repository';
import { BoardScheduler } from './board-scheduler';
import { DAY_KEY_GUARD, RedisDayKeyGuard } from './day-key.guard';
import { Infrastructure } from './infrastructure';
import { RecapPoster } from './recap-poster';
import { SlatePoster, SLATE_PACE } from './slate-poster';
import { DrizzleSlateStore, SLATE_STORE } from './slate-store';

/**
 * The poster's one outbound call, bound to DISC-12's queue.
 *
 * `RateLimiter` and `DiscordClientService` are providers of the root module, which
 * exports neither, so this resolves them through `ModuleRef` — the same mechanism
 * `Infrastructure` and `lock/sweep-runtime.ts` use. The lookup happens on the first
 * post, not at module construction, so the container is fully built by then.
 *
 * Attaching the queue to discord.js's REST emitter is what makes per-route
 * awareness real in production: discord.js answers its own 429s internally, so
 * without the emitter the queue would never see `X-RateLimit-Remaining` or a
 * `rateLimited` event at all.
 */
function bindPace(moduleRef: ModuleRef) {
  let limiter: RateLimiter | undefined;

  const resolve = (): RateLimiter => {
    if (!limiter) {
      const created = moduleRef.get(RateLimiter, { strict: false });
      created.attachRest(moduleRef.get(DiscordClientService, { strict: false }).client.rest);
      limiter = created;
    }
    return limiter;
  };

  return <T>(task: () => Promise<T>, route?: string) => resolve().schedule(task, route);
}

/**
 * Per-guild config and the daily leaderboard (DISC-09, DISC-10).
 *
 * Four pieces, in the order a post flows through them:
 *
 * - `GuildConfigService` — the `discord_guilds` row: channel, local hour, zone.
 * - `BoardScheduler` — the minute cron, which decides *whether* it is time.
 * - `BoardRepository` — how the recent league days stand, and the settled-pick count.
 * - `RedisDayKeyGuard` — one key per post, so the other 59 minutes are free.
 *
 * `Infrastructure` is the single place that resolves `DatabaseService`,
 * `RedisService`, and `DiscordClientService`: `app.module.ts` owns those providers
 * and exports none of them, and this chunk may not edit that file. Everything here
 * takes its database, Redis, and client through it.
 *
 * `SlatePoster` stays because the board still needs two answers only it can give — is
 * there a slate today, and which day is next — plus the off-day note, and because it
 * posts the next slate's cards in the same tick as the board. Only the *operator* ops
 * (`/slate`, `bun run force:slate`) post a named day by hand.
 *
 * `RedisDayKeyGuard` holds one key per post: `recap:guildId:YYYY-MM-DD` for the board,
 * `cards:guildId:YYYY-MM-DD` for the cards, and `note:guildId:YYYY-MM-DD` for the
 * off-day note. Three keyspaces, because each is about a different day.
 *
 * `GuildConfigService` is also bound to the token `GUILD_CONFIG` and exported, because
 * `SetupCommand` is a provider of `AppModule` and injects it: `/setup` writes the row
 * the scheduler reads. It injects by token rather than by class, which is what keeps
 * the import graph acyclic — see `setup/tokens.ts`.
 */
@Module({
  imports: [DiscordConfigModule],
  providers: [
    Infrastructure,
    GuildConfigService,
    { provide: GUILD_CONFIG, useExisting: GuildConfigService },
    GuildLifecycle,
    DrizzleSlateStore,
    { provide: SLATE_STORE, useExisting: DrizzleSlateStore },
    RedisDayKeyGuard,
    { provide: DAY_KEY_GUARD, useExisting: RedisDayKeyGuard },
    SlatePoster,
    { provide: SLATE_PACE, useFactory: bindPace, inject: [ModuleRef] },
    // The board (0.5.1): the one post the bot still makes on a schedule.
    BoardRepository,
    RecapPoster,
    BoardScheduler,
  ],
  exports: [GUILD_CONFIG],
})
export class SchedulerModule {}
