import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../redis.service';
import { PlayerSyncService } from '../player-sync.service';
import { QUEUE_NAMES } from '../queue.service';
import { resolveCurrentSeason } from '../season';

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
        await this.playerSyncService.syncPlayers(resolveCurrentSeason());
      },
      { connection },
    ).on('failed', (job, error) => {
      this.logger.error(`syncPlayers failed: ${job?.id}`, error);
    });
  }
}
