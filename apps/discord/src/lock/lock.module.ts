import { Module } from '@nestjs/common';
import { SettlementModule } from '../settlement/settlement.module';
import { LockSweepService } from './lock-sweep.service';

/**
 * DISC-05 and DISC-11: the two sweeps that edit a posted card after it is posted.
 *
 * `LockSweepService` runs every minute and disables the buttons at tip-off.
 * `SettlementSweepService` (in `SettlementModule`, nested here) runs every minute
 * and replaces the card with the final score.
 *
 * Neither provider injects `DatabaseService` or `DiscordClientService` directly:
 * those belong to the root module, which does not export them, and this chunk may
 * not edit `app.module.ts`. `sweep-runtime.ts` resolves them through `ModuleRef`
 * instead — the same mechanism `interactions/router.ts` uses.
 */
@Module({
  imports: [SettlementModule],
  providers: [LockSweepService],
})
export class LockModule {}
