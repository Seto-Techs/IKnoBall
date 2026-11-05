import { Module } from '@nestjs/common';
import { StakeSweepService } from './stake-sweep.service';

/**
 * The sweep that fills in — and keeps honest — the points line on a posted card.
 *
 * Nested inside `LockModule` (which the root module already imports), so it needs
 * no line in `app.module.ts`. It shares `lock/`'s payload, editor, and sweep loop:
 * the card it edits is the card that was posted, rebuilt from the same rows, which
 * is what makes the edit invisible apart from the points.
 */
@Module({
  providers: [StakeSweepService],
})
export class StakesModule {}
