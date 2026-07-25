import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtHelperService } from '../../helper/jwt/jwt.service';
import { ContextService } from '../../helper/context/context.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtHelperService,
    private readonly context: ContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) return true;

    try {
      const payload = this.jwt.verify(token);
      this.context.setUser(payload);
    } catch {
      // Token invalid or expired — ignore for optional guard
    }

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
