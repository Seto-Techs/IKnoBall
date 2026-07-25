import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: IORedis | null = null;

  constructor() {
    this.client = new IORedis(process.env.REDIS_URL || '', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.client.on('ready', () => this.logger.log('Redis: ready'));
    this.client.on('error', (error) => this.logger.error('Redis: error', error));
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient(): IORedis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }
}
