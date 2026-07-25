import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';
import { NbaBoxScoreClient } from './nba-boxscore.client';
import { NbaCdnBoxScoreClient } from './nba-cdn-boxscore.client';
import { BoxscoreCrawlerService } from './boxscore-crawler.service';

@Module({
  providers: [DatabaseService, RedisService, NbaBoxScoreClient, NbaCdnBoxScoreClient, BoxscoreCrawlerService],
})
export class BoxscoreModule {}
