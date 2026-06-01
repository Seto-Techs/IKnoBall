import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from './redis.service';

export const QUEUE_NAMES = {
  syncPlayers: 'syncPlayers',
  crawlPlayerCareer: 'crawlPlayerCareer',
  syncSchedule: 'syncSchedule',
  liveBoxscore: 'liveBoxscore',
};

@Injectable()
export class QueueService {
  private readonly syncPlayersQueue: Queue;
  private readonly crawlPlayerCareerQueue: Queue;
  private readonly syncScheduleQueue: Queue;
  private readonly liveBoxscoreQueue: Queue;

  constructor(private readonly redisService: RedisService) {
    const connection = this.redisService.getClient();
    this.syncPlayersQueue = new Queue(QUEUE_NAMES.syncPlayers, { connection });
    this.crawlPlayerCareerQueue = new Queue(QUEUE_NAMES.crawlPlayerCareer, { connection });
    this.syncScheduleQueue = new Queue(QUEUE_NAMES.syncSchedule, { connection });
    this.liveBoxscoreQueue = new Queue(QUEUE_NAMES.liveBoxscore, { connection });
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

  async enqueueSyncSchedule(
    jobId = 'syncSchedule',
    data: { mode?: 'today' | 'all' } = {},
  ) {
    await this.syncScheduleQueue.add(
      'syncSchedule',
      data,
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async upsertLiveBoxscoreScheduler(gameId: string, startAt: Date, intervalMs: number) {
    const schedulerId = this.liveBoxscoreSchedulerId(gameId);
    const startDate = Math.max(startAt.getTime(), Date.now());
    await this.liveBoxscoreQueue.upsertJobScheduler(
      schedulerId,
      {
        every: intervalMs,
        startDate,
      },
      {
        name: 'liveBoxscore',
        data: { gameId },
        opts: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    );
  }

  async removeLiveBoxscoreScheduler(gameId: string) {
    const schedulerId = this.liveBoxscoreSchedulerId(gameId);
    const scheduler = await this.liveBoxscoreQueue.jobScheduler;
    await scheduler.removeJobScheduler(schedulerId);
  }

  private liveBoxscoreSchedulerId(gameId: string) {
    return `live-boxscore:${gameId}`;
  }
}
