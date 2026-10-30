import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused } from '../ops/kill-switch';
import { GuildConfigService, type GuildSettings } from '../setup/guild-config.service';
import { DAY_KEY_GUARD, dayKey, type DayKeyGuard } from './day-key.guard';
import { etDateKey, localHour } from './slate-date';
import { SlatePoster } from './slate-poster';

/** What one guild did in one tick. */
export type TickStatus = 'posted' | 'empty' | 'already-posted' | 'not-due' | 'failed';

export interface TickOutcome {
  guildId: string;
  status: TickStatus;
}

/**
 * The minute cron that gives each guild its slate at its own local hour.
 *
 * Three checks, cheapest first, and every one of them can say no:
 *
 * 1. `DISCORD_ENABLED=false` stops posting entirely (the kill switch DISC-14
 *    needs; `ops/kill-switch.ts` owns the predicate, the config service the flag).
 * 2. The guild's **wall clock** hour must equal its `postHour`. A minute cron
 *    means sixty chances inside that hour, so a restart at 9:05 still posts, and
 *    9:59 still posts — but 10:00 does not.
 * 3. `guildId:<ET day>` must be absent from Redis. The durable half of that guard
 *    is in `discord_cards`, which is written before anything is sent.
 *
 * A guild that throws is logged and skipped: one server's broken channel must not
 * stop the rest of the sweep (the isolation DISC-14 asks for).
 */
@Injectable()
export class SlateScheduler {
  private readonly logger = new Logger(SlateScheduler.name);
  /** A post that outlives its minute must not overlap the next tick. */
  private running = false;
  /** True once the switch-off warning has been logged, so the minute cron does not repeat it. */
  private pausedNotice = false;

  constructor(
    private readonly config: DiscordConfigService,
    private readonly guilds: GuildConfigService,
    private readonly poster: SlatePoster,
    @Inject(DAY_KEY_GUARD) private readonly guard: DayKeyGuard,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(now: Date = new Date()): Promise<TickOutcome[]> {
    // The kill switch: no slate is posted in any guild while it is off. Logged on
    // the transition only — this runs every minute, and 1440 identical warnings a
    // day is how a real warning gets ignored. `/status` shows the switch at any time.
    if (paused(this.config)) {
      if (!this.pausedNotice) {
        this.pausedNotice = true;
        this.logger.warn('DISCORD_ENABLED=false: no slate is being posted in any guild.');
      }
      return [];
    }
    this.pausedNotice = false;

    if (this.running) {
      this.logger.warn('The previous slate tick is still running; skipping this minute.');
      return [];
    }

    this.running = true;
    try {
      const outcomes: TickOutcome[] = [];

      for (const guild of await this.guilds.listEnabled()) {
        try {
          outcomes.push({ guildId: guild.guildId, status: await this.runForGuild(guild, now) });
        } catch (error) {
          this.logger.error(
            `Slate post failed for guild ${guild.guildId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
          outcomes.push({ guildId: guild.guildId, status: 'failed' });
        }
      }

      return outcomes;
    } finally {
      this.running = false;
    }
  }

  /**
   * One guild, one instant.
   *
   * The Redis day key is written **after** the attempt, not before: a failed post
   * must be retried inside the hour, while an empty day or an already-claimed
   * slate is finished business and is recorded so the rest of the hour is quiet.
   */
  async runForGuild(guild: GuildSettings, now: Date): Promise<TickStatus> {
    if (localHour(now, guild.timezone) !== guild.postHour) return 'not-due';

    // The slate day is the ET day, the same key the games were selected by, so
    // the key and the cards it guards can never drift apart.
    const key = dayKey(guild.guildId, etDateKey(now));
    if (await this.guard.has(key)) return 'already-posted';

    const result = await this.poster.post(
      { guildId: guild.guildId, channelId: guild.channelId },
      now,
    );
    await this.guard.remember(key);

    return result.status;
  }
}
