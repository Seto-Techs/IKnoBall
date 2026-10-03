import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PredictionSettlementService } from './prediction-settlement.service';

@Module({
  providers: [DatabaseService, PredictionSettlementService],
})
export class SettlementModule {}
