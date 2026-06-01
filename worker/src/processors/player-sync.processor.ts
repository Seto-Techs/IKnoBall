import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../redis.service';
import { PlayerSyncService } from '../player-sync.service';
import { QUEUE_NAMES } from '../queue.service';

@Injectable()
export class PlayerSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(PlayerSyncProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly playerSyncService: PlayerSyncService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    new Worker(
      QUEUE_NAMES.syncPlayers,
      async () => {
        const season = process.env.NBA_CURRENT_SEASON || '';
        if (!season) {
          throw new Error('NBA_CURRENT_SEASON is required');
        }
        await this.playerSyncService.syncPlayers(season);
      },
      { connection },
    ).on('failed', (job, error) => {
      this.logger.error(`syncPlayers failed: ${job?.id}`, error);
    });
  }
}
