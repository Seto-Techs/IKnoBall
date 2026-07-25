import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtHelperService } from '../../helper/jwt/jwt.service';
import { ContextService } from '../../helper/context/context.service';
import { RedisService } from '../../helper/redis/redis.service';

const SESSION_ACTIVE_PREFIX = 'sessions:active:';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtHelperService,
    private readonly context: ContextService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    let payload: any;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // If the token has a sessionId, verify the session is still active in Redis
    if (payload.sessionId) {
      try {
        const active = await this.redis.keyExists(
          `${SESSION_ACTIVE_PREFIX}${payload.sessionId}`,
        );
        if (!active) {
          throw new UnauthorizedException('Session invalid');
        }
      } catch (err) {
        // Re-throw known NestJS exceptions, swallow Redis errors (fallback mode)
        if (err instanceof UnauthorizedException) throw err;
        // Redis down — proceed with just the JWT
      }
    }
    (request as any).user = payload;
    this.context.setUser(payload);
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth) return undefined;

    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;

    return token;
  }
}
