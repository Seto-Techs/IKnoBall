import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SettlementModule } from './settlement.module';
import { PredictionSettlementService } from './prediction-settlement.service';

async function run() {
  const app = await NestFactory.createApplicationContext(SettlementModule, {
    logger: ['log', 'error', 'warn'],
  });

  const settlement = app.get(PredictionSettlementService);
  const result = await settlement.settlePending();
  console.log(JSON.stringify(result));

  await app.close();
}

run();
