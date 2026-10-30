import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../infrastructure/better-auth/auth.config';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { RedisService } from '../infrastructure/redis/redis.service';
import { PredictionsService, type PickWithGame } from '../predictions.service';
import { InternalModule } from './internal.module';
import { ListPicksQueryDto } from './picks.dto';
import { InternalPicksController } from './picks.controller';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the controller's constructor dependencies or
// the handler's parameter types (`tsc` emits both in a real build).
Reflect.defineMetadata('design:paramtypes', [PredictionsService], InternalPicksController);
Reflect.defineMetadata(
  'design:paramtypes',
  [ListPicksQueryDto],
  InternalPicksController.prototype,
  'listPicks',
);

const TOKEN = 'test-internal-token';
const USER_ID = 'user_01TESTUSER';

/**
 * `GET /internal/picks` — the wire shape and the guards.
 *
 * `listPicks`' SQL is covered by `predictions.service.spec.ts`; what matters here
 * is that the route hands the parsed `userId` to the same service the web route
 * uses and returns its rows untouched.
 */
describe('GET /api/internal/picks', () => {
  let app: INestApplication<App>;
  const listPicks = vi.fn<(userId: string) => Promise<PickWithGame[]>>();

  function get(query: string, token: string | null = TOKEN) {
    const call = request(app.getHttpServer()).get(`/api/internal/picks${query}`);
    if (token !== null) call.set('X-Internal-Token', token);
    return call;
  }

  beforeAll(async () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;
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
        RedisModule,
        InternalModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({ getClient: () => ({}), onModuleDestroy: async () => undefined })
      .overrideProvider(PredictionsService)
      .useValue({ listPicks })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    listPicks.mockReset();
    listPicks.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the service rows for a user', async () => {
    const rows: PickWithGame[] = [
      {
        gameId: '0022600128',
        mode: 'flat',
        side: 'away',
        lockedDecimal: null,
        lockedBook: null,
        lockedAt: null,
        points: null,
        status: 'pending',
        settledAt: null,
        pendingPrice: false,
        homeTeam: 'Toronto Raptors',
        awayTeam: 'Miami Heat',
        homeTricode: 'TOR',
        awayTricode: 'MIA',
        homeScore: null,
        awayScore: null,
        gameDateTime: new Date('2026-10-27T23:30:00.000Z'),
        gameStatus: 1,
      },
    ];
    listPicks.mockResolvedValue(rows);

    const res = await get(`?userId=${USER_ID}`).expect(200);

    expect(listPicks).toHaveBeenCalledWith(USER_ID);
    expect(res.body).toMatchObject({ is_success: true, message: 'Picks fetched.' });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      gameId: '0022600128',
      mode: 'flat',
      side: 'away',
      awayTricode: 'MIA',
      pendingPrice: false,
    });
  });

  it('returns an empty list for a user with no picks', async () => {
    const res = await get(`?userId=${USER_ID}`).expect(200);

    expect(res.body.data).toEqual([]);
  });

  it('401s without a token', () => get(`?userId=${USER_ID}`, null).expect(401));

  it('401s with the wrong token', () => get(`?userId=${USER_ID}`, 'not-the-token').expect(401));

  it('400s without a userId', async () => {
    await get('').expect(400);
    await get('?userId=').expect(400);

    expect(listPicks).not.toHaveBeenCalled();
  });
});
