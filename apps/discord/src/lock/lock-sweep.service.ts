import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DiscordConfigService } from '../config/discord-config.service';
import { paused } from '../ops/kill-switch';
import { CardSweep } from './card-sweep';
import { deadCards } from './dead-cards';
import { LockSweep } from './lock-sweep';
import { buildSweepRuntime, type SweepRuntime } from './sweep-runtime';

/**
 * The minute cron behind DISC-05.
 *
 * Every minute: find cards whose game is past tip-off and which have not been
 * disabled yet, edit each one to `disabled: true` plus "🔒 Locked at tip-off", and
 * stamp `lockedAt`. The edit is cosmetic — `PredictionsService.placePick` already
 * rejects a pick once `now >= gameDateTimeUTC`, so no late pick can be recorded
 * even if every edit here fails. What the edit buys is that the card stops *looking*
 * open, within a minute of tip-off.
 *
 * The work itself lives in `CardSweep` and `LockSweep`; this class only owns the
 * schedule and the wiring, so the logic is testable without Nest.
 *
 * `DISCORD_ENABLED=false` (the kill switch, DISC-14) returns before `run()`, so a
 * paused bot edits no card and stamps nothing — the cards stay as they are until
 * the switch is turned back on.
 */
@Injectable()
export class LockSweepService implements OnModuleInit {
  private readonly logger = new Logger(LockSweepService.name);
  private sweep: CardSweep | null = null;
  /** The kill switch, resolved with the rest of the runtime in `onModuleInit`. */
  private config!: DiscordConfigService;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    this.config = this.moduleRef.get(DiscordConfigService, { strict: false });
    const runtime: SweepRuntime = buildSweepRuntime(this.moduleRef);

    this.sweep = new CardSweep({
      source: new LockSweep(runtime.repository),
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
