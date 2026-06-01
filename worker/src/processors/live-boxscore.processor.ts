import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { BoxscoreCrawlerService } from '../boxscore-crawler.service';
import { QueueService, QUEUE_NAMES } from '../queue.service';
import { RedisService } from '../redis.service';

@Injectable()
export class LiveBoxscoreProcessor implements OnModuleInit {
  private readonly logger = new Logger(LiveBoxscoreProcessor.name);
  private readonly ttlSeconds = Number(process.env.NBA_LIVE_BOXSCORE_TTL_SECONDS || '21600');

  constructor(
    private readonly redisService: RedisService,
    private readonly boxscoreCrawler: BoxscoreCrawlerService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    new Worker(
      QUEUE_NAMES.liveBoxscore,
      async (job) => {
        const { gameId } = job.data as { gameId: string };
        if (!gameId) {
          throw new Error('gameId is required');
        }
        const status = await this.boxscoreCrawler.syncGameBoxscoreLive(gameId, this.ttlSeconds);
        if (status === 3) {
          await this.queueService.removeLiveBoxscoreScheduler(gameId);
          this.logger.log(`live boxscore stopped game=${gameId} final`);
        }
      },
      { connection },
    ).on('failed', (job, error) => {
      this.logger.error(`liveBoxscore failed: ${job?.id}`, error);
    });
  }
}
