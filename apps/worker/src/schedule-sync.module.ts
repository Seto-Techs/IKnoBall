import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';
import { NbaScheduleClient } from './nba-schedule.client';
import { QueueService } from './queue.service';
import { ScheduleSyncService } from './schedule-sync.service';

@Module({
  providers: [DatabaseService, RedisService, NbaScheduleClient, QueueService, ScheduleSyncService],
})
export class ScheduleSyncModule {}
