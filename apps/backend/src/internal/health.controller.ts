import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { InternalTokenGuard } from './internal-token.guard';

/**
 * The bot's liveness probe, and the proof that the guard pattern works.
 *
 * `@AllowAnonymous()` is load-bearing, not decorative: the global auth guard
 * rejects session-less requests before any handler runs, so without it this route
 * would 401 and `InternalTokenGuard` would never execute. POST because the bot's
 * client only speaks POST to `/internal/*` and nothing here is cacheable.
 */
@AllowAnonymous()
@Controller('internal')
@UseGuards(InternalTokenGuard)
export class InternalHealthController {
  @Post('health')
  @HttpCode(HttpStatus.OK)
  health(): ApiResponse<{ status: string }> {
    return response(true, 'Internal API is reachable.', { status: 'ok' });
  }
}
