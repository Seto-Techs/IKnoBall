import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TeamSeedService } from './team-seed.service';

@Module({
  providers: [DatabaseService, TeamSeedService],
})
class SeedModule {}

async function run() {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'error', 'warn'],
  });

  const seeder = app.get(TeamSeedService);
  await seeder.seed();

  await app.close();
}

run();
