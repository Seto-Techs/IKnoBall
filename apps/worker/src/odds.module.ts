import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { NbaCdnOddsClient } from './nba-odds.client';
import { OddsSyncService } from './odds-sync.service';

@Module({
  providers: [DatabaseService, NbaCdnOddsClient, OddsSyncService],
})
export class OddsModule {}
