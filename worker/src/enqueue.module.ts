import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { QueueService } from './queue.service';

@Module({
  providers: [RedisService, QueueService],
})
export class EnqueueModule {}
