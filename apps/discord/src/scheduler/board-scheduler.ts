import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused } from '../ops/kill-switch';
import { GuildConfigService, type GuildSettings } from '../setup/guild-config.service';
import { latestFinishedDay, recapDueAt, type DayState } from './board';
import { BoardRepository } from './board-repository';
import { DAY_KEY_GUARD, noteKey, recapKey, type DayKeyGuard } from './day-key.guard';
import { RecapPoster } from './recap-poster';
import { etDateKey, etNoon } from './slate-date';
import { SlatePoster, type SlateTarget } from './slate-poster';

/** What one guild did in one tick. */
export type BoardStatus =
  /** The board went out. */
  | 'posted'
  /** The day had no settled picks: nothing to show, retried next minute. */
  | 'skipped'
  /** The board's posting time has not come round yet. */
  | 'not-due'
  /** No league day has finished yet, so there is no board to post. */
  | 'no-day'
  /** This day's board already went out. */
  | 'already-posted'
  /** Something threw. Isolated to this guild. */
  | 'failed';

export interface BoardOutcome {
  guildId: string;
  status: BoardStatus;
  /** The ET slate day the board was for, or null when no day has finished. */
  day: string | null;
}

/**
 * The minute cron that posts each guild its daily leaderboard (0.5.1).
 *
 * Picks live in the Activity now, so the bot no longer posts cards and there is no
 * slate to roll over. What is left is the one post that is still the bot's job: the
 * board, once a day, into the channel `/setup` configured.
 *
 * **The board goes out at the later of noon ET and fifteen minutes after the last
 * buzzer** (`recapDueAt`). Both halves are league-wide: the slate day is US/Eastern for
 * every guild, so one instant serves the whole fleet, and a board that lands while the
 * last game is still settling would rank the night without its final picks. Noon is the
 * other floor — a recap at 1 a.m. is read by nobody. `latestFinishedDay` means a missed
 * morning catches up on the next tick instead of skipping a day.
 *
 * Per tick, cheapest first, and every step can say no:
 *
 * 1. `DISCORD_ENABLED=false` stops it entirely — the same kill switch as before.
 * 2. `BoardRepository.daysSince` answers, in one query for all guilds, how the last
 *    week's league days stand. `latestFinishedDay` picks the one the board is for.
 * 3. A board that is not due yet is skipped; a minute cron means the first tick after
 *    `recapDueAt` posts, so a restart at 12:05 still gets that day's board out.
 * 4. `recap:<guildId>:<day>` must be absent, so the other 59 minutes are free.
 * 5. `RecapPoster` counts the day's settled picks and declines an empty board.
 *
 * A guild that throws is logged and skipped, so one server's broken channel cannot
 * stop the rest of the sweep.
 */
@Injectable()
export class BoardScheduler {
  private readonly logger = new Logger(BoardScheduler.name);
  /** A tick that outlives its minute must not overlap the next one. */
  private running = false;
  /** True once the switch-off warning has been logged. */
  private pausedNotice = false;

  constructor(
    private readonly config: DiscordConfigService,
    private readonly guilds: GuildConfigService,
    private readonly repo: BoardRepository,
    private readonly recaps: RecapPoster,
    private readonly poster: SlatePoster,
    @Inject(DAY_KEY_GUARD) private readonly guard: DayKeyGuard,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(now: Date = new Date()): Promise<BoardOutcome[]> {
    // The kill switch: nothing is posted in any guild while it is off. Logged on the
    // transition only — this runs every minute, and 1440 identical warnings a day is
    // how a real warning gets ignored. `/status` shows the switch at any time.
    if (paused(this.config)) {
      if (!this.pausedNotice) {
        this.pausedNotice = true;
        this.logger.warn('DISCORD_ENABLED=false: no leaderboard is being posted in any guild.');
      }
      return [];
    }
    this.pausedNotice = false;

    if (this.running) {
      this.logger.warn('The previous board tick is still running; skipping this minute.');
      return [];
    }

    this.running = true;
    try {
      const enabled = await this.guilds.listEnabled();
      if (enabled.length === 0) return [];

      // League-wide, so one answer covers every guild: the slate day is US/Eastern
      // for everyone, whatever hour it is where the reader lives.
      const day = latestFinishedDay(await this.repo.daysSince(now), now);
      const outcomes: BoardOutcome[] = [];

      for (const guild of enabled) {
        try {
          outcomes.push({
            guildId: guild.guildId,
            day: day?.slateKey ?? null,
            status: await this.runForGuild(guild, day, now),
          });
        } catch (error) {
          this.logger.error(
            `Leaderboard post failed for guild ${guild.guildId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
          outcomes.push({ guildId: guild.guildId, day: day?.slateKey ?? null, status: 'failed' });
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
   * The board first and the off-day note second, the same order the old slate tick
   * used: the post people are waiting for must not be lost to a courtesy. The note
   * waits for noon too — "no games today" is a morning message, and midnight is not
   * morning — while the board waits for `recapDueAt`, which can be later.
   */
  async runForGuild(guild: GuildSettings, day: DayState | null, now: Date): Promise<BoardStatus> {
    if (day !== null && now.getTime() < recapDueAt(day).getTime()) return 'not-due';

    const status = await this.postBoard(guild, day);
    if (this.morningReached(now)) await this.noteOffDay(guild, now);

    return status;
  }

  /** Has noon come round in US/Eastern today? */
  private morningReached(now: Date): boolean {
    return now.getTime() >= etNoon(etDateKey(now)).getTime();
  }

  /**
   * The day's board, once.
   *
   * The key is remembered **after** the send, so a failure is retried on the next tick.
   * A day the poster declined — no settled picks yet — is not remembered either: a
   * settlement that lands a minute later still gets its board.
   */
  private async postBoard(guild: GuildSettings, day: DayState | null): Promise<BoardStatus> {
    if (day === null) return 'no-day';

    const key = recapKey(guild.guildId, day.slateKey);
    if (await this.guard.has(key)) return 'already-posted';

    const target: SlateTarget = { guildId: guild.guildId, channelId: guild.channelId };
    const status = await this.recaps.post(target, day.slateKey);
    if (status === 'posted') {
      this.logger.log(`Leaderboard posted for guild ${guild.guildId} on ${day.slateKey}.`);
      await this.guard.remember(key);
    }

    return status;
  }

  /**
   * Tell a guild its day has no games, once, with the next slate named.
   *
   * The board covers a day that had games; a day that had none is silence, which is
   * why this note outlived the cards it used to sit beside. It is about *today*, so it
   * keys on `today` and not on the board's day, and it is swallowed on failure: a
   * missing note is a quiet channel, a thrown one would take the tick's status with it.
   */
  private async noteOffDay(guild: GuildSettings, now: Date): Promise<void> {
    const today = etDateKey(now);
    const key = noteKey(guild.guildId, today);
    if (await this.guard.has(key)) return;

    const target: SlateTarget = { guildId: guild.guildId, channelId: guild.channelId };
    try {
      if (await this.poster.hasGames(today)) {
        await this.guard.remember(key);
        return;
      }

      // Nothing ahead to name either: the schedule has not been crawled this far, or
      // the season is over. `null` makes the note say so.
      const nextKey = await this.poster.nextSlateDay(now);
      await this.poster.postOffDay(target, today, nextKey === today ? null : nextKey);
      await this.guard.remember(key);
    } catch (error) {
      this.logger.warn(
        `Off-day note failed for guild ${guild.guildId} on ${today}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
