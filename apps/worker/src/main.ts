import 'reflect-metadata';
import { config } from 'dotenv';
// Cascade: root .env first (defaults), then CWD .env (overrides)
config({ path: '../../.env' });
config({ path: '../.env' });
config({ override: true });
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './worker.module';
import { ScheduleSyncService } from './schedule-sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const scheduleSync = app.get(ScheduleSyncService);
  void scheduleSync.syncScheduleForToday().catch((error: unknown) => {
    const logger = new Logger('Bootstrap');
    if (error instanceof Error) {
      logger.error(`schedule sync failed on start: ${error.name}: ${error.message}`, error.stack);
    } else {
      logger.error(`schedule sync failed on start: ${String(error)}`);
    }
  });

  app.enableShutdownHooks();
}

bootstrap();
//
