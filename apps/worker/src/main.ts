import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './worker.module';
import { ScheduleSyncService } from './schedule-sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const scheduleSync = app.get(ScheduleSyncService);
  void scheduleSync.syncScheduleForToday().catch((error) => {
    const logger = new Logger('Bootstrap');
    logger.error('schedule sync failed on start', error as Error);
  });

  app.enableShutdownHooks();
}

bootstrap();
//
