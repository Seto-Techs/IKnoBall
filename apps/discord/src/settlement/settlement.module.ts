import { Module } from '@nestjs/common';
import { SettlementSweepService } from './settlement-sweep.service';

/**
 * DISC-11: the sweep that edits a card once its game is final.
 *
 * Nested inside `LockModule` (which the root module already imports), so it needs
 * no line in `app.module.ts`. It shares `lock/`'s card payload, editor, and sweep
 * loop: a settled card is the locked card plus a score, and keeping one
 * implementation is what stops the two edits drifting apart.
 */
@Module({
  providers: [SettlementSweepService],
})
export class SettlementModule {}
