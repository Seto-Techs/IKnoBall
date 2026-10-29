import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Service-to-service auth for `/internal/*`: the caller sends
 * `X-Internal-Token`, and it must equal `INTERNAL_API_TOKEN`.
 *
 * This is not a user session and not a bearer token — it is the same shape as the
 * existing `EMAIL_INTERNAL_TOKEN` precedent. Controllers that use it must also be
 * `@AllowAnonymous()`: `AuthModule.forRootAsync` installs a **global** `APP_GUARD`
 * that rejects any request without a session *before* a route handler (and
 * therefore before this guard) runs. `@AllowAnonymous()` sets the reflector key
 * that guard checks first, which is what lets a session-less bot request reach
 * this check at all.
 *
 * It fails closed: with `INTERNAL_API_TOKEN` unset, every request is rejected
 * rather than every request being allowed.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  private readonly logger = new Logger(InternalTokenGuard.name);
  private missingTokenLogged = false;

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_TOKEN?.trim();

    if (!expected) {
      // Logged once, not per request: a misconfigured deploy must be loud without
      // turning every bot call into a log line.
      if (!this.missingTokenLogged) {
        this.missingTokenLogged = true;
        this.logger.error(
          'INTERNAL_API_TOKEN is not set: rejecting every /internal request until it is configured.',
        );
      }
      throw new UnauthorizedException('Internal API is not configured.');
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = request.headers['x-internal-token'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !tokensMatch(provided, expected)) {
      throw new UnauthorizedException('Invalid internal token.');
    }

    return true;
  }
}

/**
 * Constant-time comparison.
 *
 * Hashing both sides first keeps the comparison independent of their lengths:
 * `timingSafeEqual` throws on unequal buffers, and comparing the raw values would
 * leak the expected token's length through that throw.
 */
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
