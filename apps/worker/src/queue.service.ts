import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from './redis.service';

export const QUEUE_NAMES = {
  syncPlayers: 'syncPlayers',
  crawlPlayerCareer: 'crawlPlayerCareer',
  syncSchedule: 'syncSchedule',
  checkLiveBoxscore: 'checkLiveBoxscore',
};

@Injectable()
export class QueueService {
  private readonly syncPlayersQueue: Queue;
  private readonly crawlPlayerCareerQueue: Queue;
  private readonly syncScheduleQueue: Queue;
  private readonly checkLiveBoxscoreQueue: Queue;

  constructor(private readonly redisService: RedisService) {
    const connection = this.redisService.getClient();
    this.syncPlayersQueue = new Queue(QUEUE_NAMES.syncPlayers, { connection });
    this.crawlPlayerCareerQueue = new Queue(QUEUE_NAMES.crawlPlayerCareer, { connection });
    this.syncScheduleQueue = new Queue(QUEUE_NAMES.syncSchedule, { connection });
    this.checkLiveBoxscoreQueue = new Queue(QUEUE_NAMES.checkLiveBoxscore, { connection });
  }

  async enqueueSyncPlayers(jobId = 'syncPlayers') {
    await this.syncPlayersQueue.add(
      'syncPlayers',
      {},
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async enqueuePlayerCareer(
    playerExternalId: string,
    options?: { delay?: number; attempt?: number; jobId?: string },
  ) {
    const jobId = options?.jobId ?? `career-${playerExternalId}`;
    await this.crawlPlayerCareerQueue.add(
      'crawlPlayerCareer',
      { playerExternalId, attempt: options?.attempt ?? 0 },
      {
        jobId,
        delay: options?.delay ?? 0,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /**
   * Career re-crawl for a player whose game just went final.
   *
   * The job id is per game, so it never dedupes against a pending
   * `career-<id>` job from the player sync: that job may have started before the
   * game's stats reached the feed, and dropping this one would leave the player
   * on their pre-game totals until the next sync.
   */
  async enqueuePlayerCareerAfterFinal(playerExternalId: string, gameId: string, delayMs: number) {
    await this.enqueuePlayerCareer(playerExternalId, {
      delay: delayMs,
      jobId: `career-${playerExternalId}-final-${gameId}`,
    });
  }

  /** Remove all waiting/delayed jobs from the career queue (stop retry storms). */
  async drainPlayerCareerQueue() {
    await this.crawlPlayerCareerQueue.drain();
  }

  /** Remove ALL jobs (including failed/completed) from the career queue. */
  async obliteratePlayerCareerQueue() {
    await this.crawlPlayerCareerQueue.obliterate();
  }

  /** Pending (waiting/active/delayed) + finished counts for the career queue. */
  async crawlPlayerCareerJobCounts() {
    return this.crawlPlayerCareerQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    );
  }

  async enqueueSyncSchedule(jobId = 'syncSchedule', data: { mode?: 'today' | 'all' } = {}) {
    await this.syncScheduleQueue.add('syncSchedule', data, {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async upsertCheckLiveBoxscoreScheduler(intervalMs: number) {
    await this.checkLiveBoxscoreQueue.upsertJobScheduler(
      'check-live-boxscore',
      { every: intervalMs, startDate: Date.now() },
      {
        name: 'checkLiveBoxscore',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: false },
      },
    );
  }

  async removeCheckLiveBoxscoreScheduler() {
    const scheduler = await this.checkLiveBoxscoreQueue.jobScheduler;
    await scheduler.removeJobScheduler('check-live-boxscore');
  }
}
