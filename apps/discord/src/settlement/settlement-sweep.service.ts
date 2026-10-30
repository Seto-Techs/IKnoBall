import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { CardSweep } from '../lock/card-sweep';
import { deadCards } from '../lock/dead-cards';
import { buildSweepRuntime } from '../lock/sweep-runtime';
import { paused } from '../ops/kill-switch';
import { SettlementSweep } from './settlement-sweep';

/**
 * The cron behind DISC-11: a card for a final game shows the score.
 *
 * It polls `schedule_games` itself rather than reacting to the worker's
 * `prediction-settlement` run. The worker's schedule is load-bearing for schedule,
 * odds, and settlement data, and this chunk does not own it; a table poll also
 * survives a missed or restarted worker job, which a cross-process event would not.
 *
 * Every minute, because the worker settles every 15 and the acceptance is "within
 * 15 minutes of a game going final" — polling at the same cadence as the lock keeps
 * one clock and one failure mode for both edits.
 *
 * DISC-11 asks for pacing when settlement touches many games at once. The edits go
 * through `RateLimiter.schedule`, which is DISC-12's single outbound queue: today it
 * runs each task straight through, and C10 can pace it without touching this file.
 */
@Injectable()
export class SettlementSweepService implements OnModuleInit {
  private readonly logger = new Logger(SettlementSweepService.name);
  private sweep: CardSweep | null = null;
  /** The kill switch, resolved with the rest of the runtime in `onModuleInit`. */
  private config!: DiscordConfigService;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    this.config = this.moduleRef.get(DiscordConfigService, { strict: false });
    const runtime = buildSweepRuntime(this.moduleRef);

    this.sweep = new CardSweep({
      source: new SettlementSweep(runtime.repository),
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
