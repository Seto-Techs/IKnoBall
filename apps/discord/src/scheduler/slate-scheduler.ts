import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused } from '../ops/kill-switch';
import { GuildConfigService, type GuildSettings } from '../setup/guild-config.service';
import { DAY_KEY_GUARD, dayKey, noteKey, type DayKeyGuard } from './day-key.guard';
import { etDateKey, localHour } from './slate-date';
import { SlatePoster, type SlateTarget } from './slate-poster';

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
   *
   * Two days are in play, which is why they are named apart. `today` is the ET day
   * the guild's wall clock is in; `etKey` is the day whose slate it should get, and
   * for a guild east of ET — a 9 a.m. post in Jakarta is 10 p.m. the night before in
   * New York — that is the *next* day. Keying the post on `today` there is what used
   * to send an empty slate of already-tipped games.
   */
  async runForGuild(guild: GuildSettings, now: Date): Promise<TickStatus> {
    if (localHour(now, guild.timezone) !== guild.postHour) return 'not-due';

    const target: SlateTarget = { guildId: guild.guildId, channelId: guild.channelId };
    const today = etDateKey(now);
    const etKey = await this.poster.nextSlateDay(now);

    // The slate day is the ET day, the same key the games were selected by, so
    // the key and the cards it guards can never drift apart.
    const key = dayKey(guild.guildId, etKey);
    let status: TickStatus;

    if (await this.guard.has(key)) {
      status = 'already-posted';
    } else {
      const result = await this.poster.postFor(target, etKey, now);
      await this.guard.remember(key);
      status = result.status;
    }

    // After the slate, so a note can never cost one: on a day the league is off
    // there is no slate to send, and silence is indistinguishable from a dead bot.
    await this.noteOffDay(target, today, etKey);

    return status;
  }

  /**
   * Tell a guild its day has no games, once, with the next slate named.
   *
   * A day that has games needs nothing said — the cards are in the channel, and a
   * day whose games have all tipped is equally finished business. The note is about
   * `today`, so it keys on `today` and not on the slate day: a guild east of ET has
   * a slate day a day ahead of its own, and the two must be able to sit in the same
   * post hour without one suppressing the other.
   *
   * Swallowed on failure. A missing note is a quiet channel; a thrown note would
   * take the tick's status with it and make the slate look failed.
   */
  private async noteOffDay(target: SlateTarget, today: string, etKey: string): Promise<void> {
    const key = noteKey(target.guildId, today);
    if (await this.guard.has(key)) return;

    try {
      if (await this.poster.hasGames(today)) {
        await this.guard.remember(key);
        return;
      }

      // Nothing ahead to name either: the schedule has not been crawled this far,
      // or the season is over. `null` makes the note say so.
      await this.poster.postOffDay(target, today, etKey === today ? null : etKey);
      await this.guard.remember(key);
    } catch (error) {
      this.logger.warn(
        `Off-day note failed for guild ${target.guildId} on ${today}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
