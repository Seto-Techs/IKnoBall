import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';

interface RateLimitConfig {
  /** Max requests allowed within the window (default 10) */
  max: number;
  /** Window duration in seconds (default 60) */
  windowSec: number;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  '/auth/sign-up/email': { max: 5, windowSec: 300 },
  '/auth/sign-in/email': { max: 10, windowSec: 300 },
  '/auth/request-password-reset': { max: 3, windowSec: 300 },
  '/auth/send-verification-email': { max: 3, windowSec: 300 },
};

const DEFAULT_CONFIG: RateLimitConfig = { max: 30, windowSec: 60 };

@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthRateLimitMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: () => void) {
    // Only rate-limit auth POST routes
    if (req.method !== 'POST') return next();

    const path = req.path;
    const config = DEFAULTS[path] ?? DEFAULT_CONFIG;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      req.socket.remoteAddress ??
      'unknown';
    const key = `ratelimit:auth:${ip}:${path}`;

    try {
      const current = await this.redis.getClient().incr(key);

      if (current === 1) {
        await this.redis.getClient().expire(key, config.windowSec);
      }

      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - current));
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + config.windowSec);

      if (current > config.max) {
        this.logger.warn(`Rate limit exceeded for ${ip} on ${path} (${current}/${config.max})`);
        res.status(429).json({
          statusCode: 429,
          message: 'Too many requests. Please try again later.',
        });
        return;
      }
    } catch (err) {
      this.logger.error('Rate limiter Redis error, allowing request through', err);
      // Fail open — don't block users if Redis is down
    }

    next();
  }
}
