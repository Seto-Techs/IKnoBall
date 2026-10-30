import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { createAuth } from '../infrastructure/better-auth/auth.config';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { RedisService } from '../infrastructure/redis/redis.service';
import { InternalModule } from './internal.module';
import { LeaderboardQueryDto } from './leaderboard.dto';
import { InternalLeaderboardController } from './leaderboard.controller';
import { ListPicksQueryDto } from './picks.dto';
import { InternalPicksController } from './picks.controller';
import { PlacePickDto } from './predictions.dto';
import { InternalPredictionsController } from './predictions.controller';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the handler parameter types that `tsc` emits in a
// real build. Without them the Zod pipe skips validation and the requests below reach
// the handlers with an undefined body/query instead of being rejected as invalid.
Reflect.defineMetadata(
  'design:paramtypes',
  [PlacePickDto],
  InternalPredictionsController.prototype,
  'placePick',
);
Reflect.defineMetadata(
  'design:paramtypes',
  [ListPicksQueryDto],
  InternalPicksController.prototype,
  'listPicks',
);
Reflect.defineMetadata(
  'design:paramtypes',
  [LeaderboardQueryDto],
  InternalLeaderboardController.prototype,
  'board',
);

const TOKEN = 'test-internal-token';

/**
 * The guard pattern, end to end.
 *
 * The point is the *global* auth guard: `AuthModule.forRoot({ disableGlobalAuthGuard:
 * false })` installs it exactly as production does, so a session-less request has to
 * get past `APP_GUARD` before it ever reaches `InternalTokenGuard`. Without
 * `@AllowAnonymous()` on these controllers every assertion below would be a 401 and
 * the token check would never run — that is the bug this test exists to catch.
 */
describe('InternalTokenGuard (/internal/*)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;

    // turbo runs tasks with a filtered environment, so DATABASE_URL can be missing here
    // even when the shell has one. Nothing in this spec queries the database —
    // `createDatabase` only builds a lazy pool — so a placeholder is enough to construct
    // the real module graph (`InternalModule` → `PredictionsModule` → `DatabaseModule`).
    process.env.DATABASE_URL ??= 'postgresql://localhost:5432/iknoball_test';

    const email = {
      sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AuthModule.forRoot({
          auth: createAuth(email as never),
          disableGlobalAuthGuard: false,
        }),
        // Real module graph; only the Redis connection is replaced, because the
        // guard under test never touches it and a live socket would make the test
        // depend on a remote service.
        RedisModule,
        InternalModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({ getClient: () => ({}), onModuleDestroy: async () => undefined })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    // Same prefix as apps/backend/src/main.ts — every route is really /api/...
    app.setGlobalPrefix('api');
    // `AppModule` registers this as `APP_PIPE`; without it a request with an empty
    // body would reach a handler instead of being rejected as invalid.
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request with no token', () =>
    request(app.getHttpServer()).post('/api/internal/health').expect(401));

  it('rejects a request with the wrong token', () =>
    request(app.getHttpServer())
      .post('/api/internal/health')
      .set('X-Internal-Token', 'not-the-token')
      .expect(401));

  it('accepts the correct token on /api/internal/health', () =>
    request(app.getHttpServer())
      .post('/api/internal/health')
      .set('X-Internal-Token', TOKEN)
      .expect(200)
      .expect({
        is_success: true,
        message: 'Internal API is reachable.',
        data: { status: 'ok' },
      }));

  // The point of these three is the guard, not the endpoint: a 400 means the
  // token got through and the handler ran, where a 401 would mean it did not.
  // All three routes reject an empty body/query before touching the database.
  it('accepts the correct token on the predictions route and reaches the handler', () =>
    request(app.getHttpServer())
      .post('/api/internal/predictions')
      .set('X-Internal-Token', TOKEN)
      .expect(400));

  it('accepts the correct token on the picks route and reaches the handler', () =>
    request(app.getHttpServer())
      .get('/api/internal/picks')
      .set('X-Internal-Token', TOKEN)
      .expect(400));

  it('accepts the correct token on the leaderboard route and reaches the handler', () =>
    request(app.getHttpServer())
      .get('/api/internal/leaderboard')
      .set('X-Internal-Token', TOKEN)
      .expect(400));

  it('guards every stub, not just health', () =>
    request(app.getHttpServer()).post('/api/internal/predictions').expect(401));

  it('fails closed when INTERNAL_API_TOKEN is unset', async () => {
    const saved = process.env.INTERNAL_API_TOKEN;
    delete process.env.INTERNAL_API_TOKEN;

    try {
      await request(app.getHttpServer())
        .post('/api/internal/health')
        .set('X-Internal-Token', TOKEN)
        .expect(401);
    } finally {
      process.env.INTERNAL_API_TOKEN = saved;
    }
  });
});
