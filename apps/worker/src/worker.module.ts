import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';
import { PlayerIndexClient } from './player-index.client';
import { PlayerSyncService } from './player-sync.service';
import { NbaScheduleClient } from './nba-schedule.client';
import { ScheduleSyncService } from './schedule-sync.service';
import { NbaBoxScoreClient } from './nba-boxscore.client';
import { NbaCdnBoxScoreClient } from './nba-cdn-boxscore.client';
import { NbaCdnPlayByPlayClient } from './nba-cdn-playbyplay.client';
import { NbaCdnOddsClient } from './nba-odds.client';
import { OddsSyncService } from './odds-sync.service';
import { PredictionSettlementService } from './prediction-settlement.service';
import { BoxscoreCrawlerService } from './boxscore-crawler.service';
import { ShotZoneSyncService } from './shot-zone-sync.service';
import { QueueService } from './queue.service';
import { PlayerSyncProcessor } from './processors/player-sync.processor';
import { PlayerSeasonProcessor } from './processors/player-season.processor';
import { ScheduleSyncProcessor } from './processors/schedule-sync.processor';
import { LiveBoxscoreProcessor } from './processors/live-boxscore.processor';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    DatabaseService,
    RedisService,
    PlayerIndexClient,
    PlayerSyncService,
    NbaScheduleClient,
    ScheduleSyncService,
    NbaBoxScoreClient,
    NbaCdnBoxScoreClient,
    NbaCdnPlayByPlayClient,
    NbaCdnOddsClient,
    OddsSyncService,
    PredictionSettlementService,
    BoxscoreCrawlerService,
    ShotZoneSyncService,
    QueueService,
    PlayerSyncProcessor,
    PlayerSeasonProcessor,
    ScheduleSyncProcessor,
    LiveBoxscoreProcessor,
  ],
})
export class AppModule {}
