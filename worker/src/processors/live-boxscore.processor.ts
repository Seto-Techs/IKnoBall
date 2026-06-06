import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { BoxscoreCrawlerService } from '../boxscore-crawler.service';
import { QueueService, QUEUE_NAMES } from '../queue.service';
import { RedisService } from '../redis.service';

@Injectable()
export class LiveBoxscoreProcessor implements OnModuleInit {
  private readonly logger = new Logger(LiveBoxscoreProcessor.name);
  private readonly ttlSeconds = Number(process.env.NBA_LIVE_BOXSCORE_TTL_SECONDS || '21600');
  private readonly skipAheadMs = 5 * 60 * 1000;

  constructor(
    private readonly redisService: RedisService,
    private readonly boxscoreCrawler: BoxscoreCrawlerService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    new Worker(
      QUEUE_NAMES.checkLiveBoxscore,
      async () => {
        const client = this.redisService.getClient();
        const gameIds = await client.smembers('nba:live:games');

        if (!gameIds.length) {
          return;
        }

        const now = Date.now();
        let remaining = 0;

        for (const gameId of gameIds) {
          const meta = await client.hgetall(`nba:live:meta:${gameId}`);
          if (!meta || !meta.gameDateTimeUTC) {
            await client.srem('nba:live:games', gameId);
            continue;
          }

          const tipoffMs = new Date(meta.gameDateTimeUTC).getTime();
          if (Number.isNaN(tipoffMs)) {
            await client.srem('nba:live:games', gameId);
            continue;
          }

          if (tipoffMs > now + this.skipAheadMs) {
            remaining++;
            continue;
          }

          const status = await this.boxscoreCrawler.syncGameBoxscoreLive(gameId, this.ttlSeconds);
          if (status === null) {
            remaining++;
            continue;
          }

          if (status === 3) {
            const pipeline = client.pipeline();
            pipeline.srem('nba:live:games', gameId);
            pipeline.del(`nba:live:meta:${gameId}`);
            await pipeline.exec();
            this.logger.log(`live boxscore stopped game=${gameId} final`);
          } else {
            remaining++;
          }
        }

        if (remaining === 0) {
          await this.queueService.removeCheckLiveBoxscoreScheduler();
          this.logger.log('live boxscore scheduler stopped no remaining games');
        }
      },
      { connection },
    ).on('failed', (job, error) => {
      this.logger.error(`checkLiveBoxscore failed: ${job?.id}`, error);
    });
  }
}
