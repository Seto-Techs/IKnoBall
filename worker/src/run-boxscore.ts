import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { BoxscoreModule } from './boxscore.module';
import { BoxscoreCrawlerService } from './boxscore-crawler.service';

async function run() {
  const app = await NestFactory.createApplicationContext(BoxscoreModule, {
    logger: ['log', 'error', 'warn'],
  });

  const crawler = app.get(BoxscoreCrawlerService);
  await crawler.crawlSeasonBoxscores();

  await app.close();
}

run();
