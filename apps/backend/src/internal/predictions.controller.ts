import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { RedisService } from '../infrastructure/redis/redis.service';
import { PredictionsService, type PickRow } from '../predictions.service';
import { InternalTokenGuard } from './internal-token.guard';
import { consumePickBudget } from './pick-throttle';
import { PlacePickDto } from './predictions.dto';

/**
 * `POST /internal/predictions` — a Discord click, as a pick.
 *
 * It calls `PredictionsService.placePick` unchanged, so the tip-off lock, the
 * flat + weighted transaction, and the odds lock all stay in the one place the
 * web routes use. Nothing here decides whether a pick is legal.
 *
 * Status codes the bot branches on:
 *
 * - `201` both rows written (or replaced); the body carries both.
 * - `400` the pick is closed — tip-off has passed, the game is no longer
 *   scheduled, or it has no tip-off time. The service's message is passed
 *   through untouched so the bot can show it verbatim.
 * - `404` unknown game (`requireOpenGame`), or unknown user (the `userId`
 *   foreign key, which is the only one on `prediction_picks` — the game is
 *   checked before any insert, so a violation here is always the user).
 * - `429` over the per-user budget (see `pick-throttle.ts`).
 */
@AllowAnonymous()
@Controller('internal/predictions')
@UseGuards(InternalTokenGuard)
export class InternalPredictionsController {
  constructor(
    private readonly predictions: PredictionsService,
    private readonly redis: RedisService,
  ) {}

  @Post()
  async placePick(@Body() body: PlacePickDto): Promise<ApiResponse<PickRow[]>> {
    const budget = await consumePickBudget(this.redis, body.userId);
    if (!budget.allowed) {
      throw new HttpException(
        `Too many pick attempts. Try again in ${budget.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const picks = await this.predictions.placePick(body.userId, {
        gameId: body.gameId,
        side: body.side,
      });
      return response(true, 'Pick saved.', picks);
    } catch (error) {
      throw mapUnknownUser(error, body.userId);
    }
  }
}

/**
 * Turn "the `users` row does not exist" into a 404.
 *
 * `placePick` does not look the user up: it inserts and lets the foreign key
 * fail. Drizzle wraps the driver error, so the Postgres `code` sits somewhere on
 * the `cause` chain rather than on the error the service throws.
 */
function mapUnknownUser(error: unknown, userId: string): unknown {
  if (!isForeignKeyViolation(error)) return error;
  return new NotFoundException(`User '${userId}' not found`);
}

/** Postgres `23503` — foreign key violation. */
function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth++) {
    if (typeof current === 'object' && (current as { code?: unknown }).code === '23503') {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
