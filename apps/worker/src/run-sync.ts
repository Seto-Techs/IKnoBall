import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { EnqueueModule } from './enqueue.module';
import { QueueService } from './queue.service';

async function run() {
  const app = await NestFactory.createApplicationContext(EnqueueModule, {
    logger: ['log', 'error', 'warn'],
  });

  const queue = app.get(QueueService);
  await queue.enqueueSyncPlayers(`syncPlayers-${Date.now()}`);

  await app.close();
}

run();
