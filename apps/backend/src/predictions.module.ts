import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PredictionsService } from './predictions.service';
import { OddsService } from './odds.service';

/**
 * `PredictionsService` and the `OddsService` it depends on, as one unit.
 *
 * They used to be bare providers on `AppModule`. The `/internal` controllers need
 * the *same* instances as the session-authenticated routes — one write path, one
 * tip-off check, one odds cache — so both modules import this instead of each
 * declaring its own copies. `RedisService` (which `OddsService` also needs) comes
 * from the global `RedisModule`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [PredictionsService, OddsService],
  exports: [PredictionsService, OddsService],
})
export class PredictionsModule {}
