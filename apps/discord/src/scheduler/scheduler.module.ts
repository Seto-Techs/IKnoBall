import { Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DiscordConfigModule } from '../config/config.module';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { GuildConfigService } from '../setup/guild-config.service';
import { GuildLifecycle } from '../setup/guild-lifecycle';
import { GUILD_CONFIG, SLATE_POSTER } from '../setup/tokens';
import { DAY_KEY_GUARD, RedisDayKeyGuard } from './day-key.guard';
import { Infrastructure } from './infrastructure';
import { RecapPoster } from './recap-poster';
import { RolloverRepository } from './rollover-repository';
import { RolloverScheduler } from './rollover-scheduler';
import { SlatePoster, SLATE_PACE } from './slate-poster';
import { SlateScheduler } from './slate-scheduler';
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
 * Per-guild config and the daily slate (DISC-09, DISC-10).
 *
 * Four pieces, in the order a post flows through them:
 *
 * - `GuildConfigService` — the `discord_guilds` row: channel, local hour, zone.
 * - `SlateScheduler` — the minute cron, which decides *whether* it is time.
 * - `SlatePoster` — selects the day's games, claims their card rows, sends.
 * - `RedisDayKeyGuard` — `guildId:YYYY-MM-DD`, so the other 59 minutes are free.
 *
 * `Infrastructure` is the single place that resolves `DatabaseService`,
 * `RedisService`, and `DiscordClientService`: `app.module.ts` owns those providers
 * and exports none of them, and this chunk may not edit that file. Everything here
 * takes its database, Redis, and client through it.
 *
 * `RolloverScheduler` is the second trigger on the same post (0.3.1): when the last
 * game of a league day goes final it posts the *next* day's slate early and recaps
 * the finished one, through the same `SlatePoster` and the same day-key guard. It
 * adds a trigger; it does not replace `SlateScheduler`'s hour.
 *
 * `GuildConfigService` and `SlatePoster` are also bound to the tokens `GUILD_CONFIG`
 * and `SLATE_POSTER` and exported, because `SetupCommand` is a provider of
 * `AppModule` and injects both: `/setup` writes the row the scheduler reads and
 * previews with the same payload builder a real post uses. It injects them by
 * token rather than by class, which is what keeps the import graph acyclic —
 * see `setup/tokens.ts`.
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
    { provide: SLATE_POSTER, useExisting: SlatePoster },
    { provide: SLATE_PACE, useFactory: bindPace, inject: [ModuleRef] },
    SlateScheduler,
    // The rollover (0.3.1): the second trigger on the same post, plus the recap.
    RolloverRepository,
    RecapPoster,
    RolloverScheduler,
  ],
  exports: [GUILD_CONFIG, SLATE_POSTER],
})
export class SchedulerModule {}
