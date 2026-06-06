import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ScheduleSyncModule } from './schedule-sync.module';
import { ScheduleSyncService } from './schedule-sync.service';

async function run() {
  const app = await NestFactory.createApplicationContext(ScheduleSyncModule, {
    logger: ['log', 'error', 'warn'],
  });

  const service = app.get(ScheduleSyncService);
  await service.syncScheduleAllForce();

  await app.close();
}

run();
