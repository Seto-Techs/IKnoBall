import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { OddsModule } from './odds.module';
import { OddsSyncService } from './odds-sync.service';

async function run() {
  const app = await NestFactory.createApplicationContext(OddsModule, {
    logger: ['log', 'error', 'warn'],
  });

  const oddsSync = app.get(OddsSyncService);
  const result = await oddsSync.syncOdds();
  console.log(JSON.stringify(result));

  await app.close();
}

run();
