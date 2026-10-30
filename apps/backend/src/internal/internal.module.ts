import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { PredictionsModule } from '../predictions.module';
import { InternalHealthController } from './health.controller';
import { InternalLeaderboardController } from './leaderboard.controller';
import { InternalLeaderboardService } from './leaderboard.service';
import { InternalPicksController } from './picks.controller';
import { InternalPredictionsController } from './predictions.controller';
import { InternalTokenGuard } from './internal-token.guard';

/**
 * The bot → API door.
 *
 * Every route here is `@AllowAnonymous()` + `InternalTokenGuard`: no session, one
 * shared secret, and the same service instances the web app writes through.
 */
@Module({
  imports: [DatabaseModule, PredictionsModule],
  controllers: [
    InternalHealthController,
    InternalPredictionsController,
    InternalPicksController,
    InternalLeaderboardController,
  ],
  providers: [InternalTokenGuard, InternalLeaderboardService],
  exports: [InternalTokenGuard],
})
export class InternalModule {}
