import { Module } from '@nestjs/common';
import { SettlementModule } from '../settlement/settlement.module';
import { StakesModule } from '../stakes/stakes.module';
import { LockSweepService } from './lock-sweep.service';

/**
 * The three sweeps that edit a posted card after it is posted.
 *
 * `LockSweepService` runs every minute and disables the buttons at tip-off.
 * `SettlementSweepService` (in `SettlementModule`, nested here) runs every minute
 * and replaces the card with the final score. `StakeSweepService` (in
 * `StakesModule`, nested here) runs every minute and puts the points line on a card
 * that was posted before its game had a price — or moves it when the line does.
 *
 * None of the providers injects `DatabaseService` or `DiscordClientService`
 * directly: those belong to the root module, which does not export them, and this
 * chunk may not edit `app.module.ts`. `sweep-runtime.ts` resolves them through
 * `ModuleRef` instead — the same mechanism `interactions/router.ts` uses.
 */
@Module({
  imports: [SettlementModule, StakesModule],
  providers: [LockSweepService],
})
export class LockModule {}
