import 'reflect-metadata';
import { config } from 'dotenv';
// Cascade: root .env first (defaults), then CWD .env (overrides)
config({ path: '../../.env' });
config({ path: '../.env' });
config({ override: true });
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { VERSION } from '@iknoball/release';
import { AppModule } from './worker.module';
import { ScheduleSyncService } from './schedule-sync.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // The worker shares its version with the backend and the frontend, so the
  // boot line is how you tell which release is running behind the queue.
  logger.log(`IKnoBall worker ${VERSION}`);

  const scheduleSync = app.get(ScheduleSyncService);
  void scheduleSync.syncScheduleForToday().catch((error: unknown) => {
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
