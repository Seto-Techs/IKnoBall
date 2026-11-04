import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { CardSweep } from '../lock/card-sweep';
import { deadCards } from '../lock/dead-cards';
import { buildSweepRuntime } from '../lock/sweep-runtime';
import { paused } from '../ops/kill-switch';
import { StakeSweep } from './stake-sweep';

/**
 * The cron that puts the points line on a card that was posted without one.
 *
 * It polls `game_odds_snapshots` rather than reacting to the worker's `odds-sync`
 * run, for the same reason the settlement sweep polls `schedule_games`: a table
 * poll survives a missed or restarted worker job, which a cross-process event would
 * not, and the worker's schedule is not this chunk's to depend on.
 *
 * Every minute, because the worker captures every five: a card posted at 14:03 has
 * its points by 14:09 at the latest, and usually within the minute the price lands.
 * The other four runs of each window find the same `CardStake` and edit nothing, so
 * the cadence costs one query pair per minute, not four Discord calls per card.
 *
 * The edits go through the same `RateLimiter` queue as the other two sweeps, so a
 * slate whose prices all land together cannot burst past Discord's limits.
 */
@Injectable()
export class StakeSweepService implements OnModuleInit {
  private readonly logger = new Logger(StakeSweepService.name);
  private sweep: CardSweep | null = null;
  /** The kill switch, resolved with the rest of the runtime in `onModuleInit`. */
  private config!: DiscordConfigService;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    this.config = this.moduleRef.get(DiscordConfigService, { strict: false });
    const runtime = buildSweepRuntime(this.moduleRef);

    this.sweep = new CardSweep({
      source: new StakeSweep(runtime.repository),
      editor: runtime.editor,
      deadCards,
      logger: this.logger,
      pace: runtime.pace,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepCards(): Promise<void> {
    // The kill switch: while it is off no card is edited and no card is stamped.
    // Silent by design — the scheduler logs the switch once, and `/status` shows it.
    if (!this.sweep || paused(this.config)) return;
    await this.sweep.run();
  }
}
