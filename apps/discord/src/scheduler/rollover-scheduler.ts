import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused } from '../ops/kill-switch';
import { GuildConfigService } from '../setup/guild-config.service';
import { DAY_KEY_GUARD, dayKey, recapKey, type DayKeyGuard } from './day-key.guard';
import { RecapPoster, type RecapStatus } from './recap-poster';
import { rolloverDecision, type RolloverReason } from './rollover';
import { RolloverRepository, type GuildRolloverState } from './rollover-repository';
import { SlatePoster, type SlateTarget } from './slate-poster';

/** What one guild did in one rollover tick. */
export type RolloverStatus =
  /** A `RolloverReason`: why the guild did not roll, or `roll` when it did. */
  | RolloverReason
  /** The next slate went out. */
  | 'rolled'
  /** The next day had no games left to post: not recorded, so a later tick retries. */
  | 'empty'
  /** The day key was already set: the timed post got there first. */
  | 'already-posted'
  /** Something threw. Isolated to this guild. */
  | 'failed';

export interface RolloverOutcome {
  guildId: string;
  status: RolloverStatus;
  /** Null when no recap was attempted, because the guild did not roll. */
  recap: RecapStatus | 'failed' | null;
}

/**
 * The minute cron that posts the next slate as soon as the last one is done.
 *
 * The design the user asked for, and the reason it is a poll rather than an event:
 * the worker knows when a game goes final (`gameStatus = 3`), but a message from the
 * worker would be lost whenever this process is restarting or mid-deploy, and a lost
 * message means a guild waits a whole day for its slate. `SettlementSweepService`
 * already polls the same tables every minute for exactly this reason. So does this.
 *
 * Per tick, cheapest first, and every step can say no:
 *
 * 1. `DISCORD_ENABLED=false` stops it entirely — the same kill switch as the timed
 *    post. Logged on the transition only.
 * 2. `RolloverRepository.statesForAllGuilds` answers, in three queries for all
 *    guilds, what each one was last posted and whether that league day is over.
 * 3. `rolloverDecision` turns that into a yes or no. A guild that never posted is
 *    not in the answer at all: it has no day to have finished.
 * 4. On a yes: `SlatePoster.postFor(next day)`, then a recap of the finished day.
 *
 * Both writes are guarded separately, and the guards are different questions:
 * `guildId:<day>` (shared with `SlateScheduler`, so the 9 a.m. tick and a midnight
 * rollover cannot both post) and `recap:<guildId>:<day>`. Neither is durable — see
 * `day-key.guard.ts` for what that costs.
 *
 * The timed post is **not** replaced. It stays as the floor: a brand-new guild, a
 * missed hour across a restart, a day whose games were postponed. This adds a second
 * trigger to the same post, it does not move the first one.
 *
 * A guild that throws is logged and skipped, so one server's broken channel cannot
 * stop the rest of the sweep.
 */
@Injectable()
export class RolloverScheduler {
  private readonly logger = new Logger(RolloverScheduler.name);
  /** A tick that outlives its minute must not overlap the next one. */
  private running = false;
  /** True once the switch-off warning has been logged. */
  private pausedNotice = false;

  constructor(
    private readonly config: DiscordConfigService,
    private readonly guilds: GuildConfigService,
    private readonly repo: RolloverRepository,
    private readonly poster: SlatePoster,
    private readonly recaps: RecapPoster,
    @Inject(DAY_KEY_GUARD) private readonly guard: DayKeyGuard,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(now: Date = new Date()): Promise<RolloverOutcome[]> {
    if (paused(this.config)) {
      if (!this.pausedNotice) {
        this.pausedNotice = true;
        this.logger.warn('DISCORD_ENABLED=false: no slate rollover is running in any guild.');
      }
      return [];
    }
    this.pausedNotice = false;

    if (this.running) {
      this.logger.warn('The previous rollover tick is still running; skipping this minute.');
      return [];
    }

    this.running = true;
    try {
      const enabled = await this.guilds.listEnabled();
      if (enabled.length === 0) return [];

      const states = new Map(
        (await this.repo.statesForAllGuilds(now)).map((state) => [state.guildId, state]),
      );

      const outcomes: RolloverOutcome[] = [];
      for (const guild of enabled) {
        const state = states.get(guild.guildId);
        if (!state) continue;

        const target: SlateTarget = { guildId: guild.guildId, channelId: guild.channelId };
        try {
          outcomes.push(await this.runForGuild(target, state, now));
        } catch (error) {
          this.logger.error(
            `Rollover failed for guild ${guild.guildId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
          outcomes.push({ guildId: guild.guildId, status: 'failed', recap: null });
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
   * The slate goes first and the recap second: the slate is what a picker is waiting
   * for, and a board that fails to post must not cost the guild its cards.
   */
  async runForGuild(
    target: SlateTarget,
    state: GuildRolloverState,
    now: Date,
  ): Promise<RolloverOutcome> {
    const decision = rolloverDecision(state);
    if (!decision.roll || decision.targetKey === null) {
      return { guildId: target.guildId, status: decision.reason, recap: null };
    }

    const status = await this.postSlate(target, decision.targetKey, now);
    // The day that just finished, not the one just posted.
    const recap = await this.postRecap(target, state.lastPostedKey);

    return { guildId: target.guildId, status, recap };
  }

  private async postSlate(target: SlateTarget, etKey: string, now: Date): Promise<RolloverStatus> {
    const key = dayKey(target.guildId, etKey);
    if (await this.guard.has(key)) return 'already-posted';

    const result = await this.poster.postFor(target, etKey, now);
    // An empty day is not remembered: the schedule may simply not be crawled yet,
    // and recording it would block the guild's timed post for the rest of the day.
    if (result.status !== 'empty') await this.guard.remember(key);

    if (result.status === 'posted') {
      this.logger.log(
        `Rolled guild ${target.guildId} onto ${etKey}: ${result.games} card(s) before its post hour.`,
      );
      return 'rolled';
    }

    return result.status;
  }

  /**
   * The finished day's board, once.
   *
   * Not retried: the roll above already advanced the guild's last posted day, so the
   * next tick has nothing to recap. A failed recap is one missing board, logged here,
   * and tomorrow's is unaffected — the alternative is holding a guild's slate back
   * until the API answers, which trades the post people need for the one they like.
   */
  private async postRecap(target: SlateTarget, etKey: string): Promise<RecapStatus | 'failed'> {
    const key = recapKey(target.guildId, etKey);
    if (await this.guard.has(key)) return 'skipped';

    try {
      const status = await this.recaps.post(target, etKey);
      if (status === 'posted') await this.guard.remember(key);
      return status;
    } catch (error) {
      this.logger.error(
        `Recap failed for guild ${target.guildId} on ${etKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return 'failed';
    }
  }
}
