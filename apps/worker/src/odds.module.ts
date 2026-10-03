import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { FallbackOddsProvider } from './fallback-odds.provider';
import { NbaCdnOddsClient } from './nba-odds.client';
import { OddsSyncService } from './odds-sync.service';
import { PinnacleOddsClient } from './pinnacle-odds.client';

@Module({
  providers: [
    DatabaseService,
    NbaCdnOddsClient,
    PinnacleOddsClient,
    FallbackOddsProvider,
    OddsSyncService,
  ],
})
export class OddsModule {}
