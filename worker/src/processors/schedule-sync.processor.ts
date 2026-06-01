import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../redis.service';
import { ScheduleSyncService } from '../schedule-sync.service';
import { QUEUE_NAMES } from '../queue.service';

@Injectable()
export class ScheduleSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScheduleSyncProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly scheduleSyncService: ScheduleSyncService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    new Worker(
      QUEUE_NAMES.syncSchedule,
      async (job) => {
        const mode = (job.data as { mode?: 'today' | 'all' })?.mode ?? 'today';
        if (mode === 'all') {
          await this.scheduleSyncService.syncScheduleAll();
          return;
        }
        await this.scheduleSyncService.syncScheduleForToday();
      },
      { connection },
    ).on('failed', (job, error) => {
      this.logger.error(`syncSchedule failed: ${job?.id}`, error);
    });
  }
}
