import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import 'reflect-metadata';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../infrastructure/better-auth/auth.config';
import type { DatabaseService } from '../infrastructure/database/database.service';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { RedisService } from '../infrastructure/redis/redis.service';
import type { OddsService } from '../odds.service';
import { PredictionsService } from '../predictions.service';
import { InternalModule } from './internal.module';
import { PICK_THROTTLE_LIMIT } from './pick-throttle';
import { PlacePickDto } from './predictions.dto';
import { InternalPredictionsController } from './predictions.controller';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the controller's constructor dependencies or
// the handler's parameter types (`tsc` emits both in a real build).
Reflect.defineMetadata(
  'design:paramtypes',
  [PredictionsService, RedisService],
  InternalPredictionsController,
);
Reflect.defineMetadata(
  'design:paramtypes',
  [PlacePickDto],
  InternalPredictionsController.prototype,
  'placePick',
);

const TOKEN = 'test-internal-token';
const USER_ID = 'user_01TESTUSER';

type Row = Record<string, unknown>;

interface FakeDbState {
  /** What `requireOpenGame` will find. Null means "no such game". */
  game: { gameId: string; gameStatus: number; gameDateTimeUTC: Date | null } | null;
  /** False makes the insert fail the way a missing `users` row does. */
  userExists: boolean;
  /** Rows that actually landed, i.e. inserts that survived the foreign key. */
  inserts: Row[];
}

/**
 * The database, as far as `PredictionsService.placePick` can tell.
 *
 * The service is used unmodified — the point of this spec is that the internal
 * route reaches the same tip-off check and the same two-row transaction as the
 * web route — so the double only has to answer the two statements it issues:
 * the `schedule_games` lookup and the insert inside `transaction`.
 */
function createFakeDb() {
  const state: FakeDbState = { game: null, userExists: true, inserts: [] };

  const tx = {
    insert: () => ({
      values: (values: Row) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            // `prediction_picks_userId_users_id_fk`, wrapped the way drizzle
            // wraps driver errors: the Postgres code lives on the cause.
            if (!state.userExists) throw foreignKeyViolation();
            state.inserts.push(values);
            return [{ status: 'pending', points: null, settledAt: null, ...values }];
          },
        }),
      }),
    }),
  };

  const select: any = {
    from: () => select,
    where: () => select,
    limit: async () => (state.game ? [state.game] : []),
  };

  const db = {
    select: () => select,
    transaction: async (fn: (transaction: unknown) => unknown) => fn(tx),
  };

  return { state, db };
}

function foreignKeyViolation(): Error {
  const pgError = Object.assign(
    new Error('violates foreign key constraint "prediction_picks_userId_users_id_fk"'),
    { code: '23503' },
  );
  return Object.assign(new Error('Failed query: insert into "prediction_picks"'), {
    cause: pgError,
  });
}

/** Redis, as far as the throttle can tell: counters with an expiry. */
class FakeRedis {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  isConnected(): boolean {
    return true;
  }

  async connect(): Promise<void> {}

  getClient() {
    return {
      incr: async (key: string) => {
        const current = this.live(key);
        const count = (current?.count ?? 0) + 1;
        this.counters.set(key, { count, expiresAt: current?.expiresAt ?? 0 });
        return count;
      },
      expire: async (key: string, seconds: number, mode?: string) => {
        const current = this.live(key);
        if (!current) return 0;
        // `NX`: only the first attempt in a window sets the expiry.
        if (mode === 'NX' && current.expiresAt > Date.now()) return 0;
        current.expiresAt = Date.now() + seconds * 1000;
        return 1;
      },
      ttl: async (key: string) => {
        const current = this.live(key);
        if (!current) return -2;
        if (current.expiresAt === 0) return -1;
        return Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000));
      },
    };
  }

  /** An expired key is gone; `expiresAt === 0` means "no expiry set yet". */
  private live(key: string) {
    const entry = this.counters.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== 0 && entry.expiresAt <= Date.now()) {
      this.counters.delete(key);
      return undefined;
    }
    return entry;
  }

  reset(): void {
    this.counters.clear();
  }
}

describe('POST /api/internal/predictions', () => {
  let app: INestApplication<App>;
  let fake: ReturnType<typeof createFakeDb>;
  const redis = new FakeRedis();

  const future = () => new Date(Date.now() + 60 * 60 * 1000);
  const openGame = () => ({ gameId: '0022600128', gameStatus: 1, gameDateTimeUTC: future() });

  function post(body: unknown, token: string | null = TOKEN) {
    const call = request(app.getHttpServer()).post('/api/internal/predictions');
    if (token !== null) call.set('X-Internal-Token', token);
    return call.send(body as object);
  }

  beforeAll(async () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;

    // Turbo runs tasks with a filtered environment, so DATABASE_URL can be absent
    // even when the shell has one. Nothing here queries the database — the
    // service's own database is the double below, and `createDatabase` only builds
    // a lazy pool — so a placeholder is enough to construct the real module graph.
    process.env.DATABASE_URL ??= 'postgresql://localhost:5432/iknoball_test';

    fake = createFakeDb();
    const predictions = new PredictionsService(
      // `DatabaseService` is a thin holder: `db` is the drizzle instance.
      { db: fake.db } as unknown as DatabaseService,
      { getGameOdds: async () => null } as unknown as OddsService,
    );

    const email = {
      sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // The global auth guard runs in production, so it runs here too: the
        // routes must survive it via `@AllowAnonymous()`.
        AuthModule.forRoot({
          auth: createAuth(email as never),
          disableGlobalAuthGuard: false,
        }),
        RedisModule,
        InternalModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(PredictionsService)
      .useValue(predictions)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    // `AppModule` registers this as `APP_PIPE`; the test app needs the same pipe
    // or an invalid body would reach the handler instead of 400ing.
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    fake.state.game = openGame();
    fake.state.userExists = true;
    fake.state.inserts = [];
    redis.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('writes both modes on the same side through placePick', async () => {
    const res = await post({ userId: USER_ID, gameId: '0022600128', side: 'away' }).expect(201);

    expect(fake.state.inserts).toHaveLength(2);
    expect(fake.state.inserts.map((row) => row.mode)).toEqual(['flat', 'weighted']);
    for (const row of fake.state.inserts) {
      expect(row).toMatchObject({
        userId: USER_ID,
        gameId: '0022600128',
        side: 'away',
      });
    }
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((row: Row) => row.mode)).toEqual(['flat', 'weighted']);
  });

  it('refuses a pick after tip-off and writes nothing', async () => {
    fake.state.game = {
      gameId: '0022600128',
      gameStatus: 1,
      gameDateTimeUTC: new Date(Date.now() - 1000),
    };

    const res = await post({ userId: USER_ID, gameId: '0022600128', side: 'home' }).expect(400);

    expect(res.body.message).toBe('Picks are closed: tip-off has passed.');
    expect(fake.state.inserts).toEqual([]);
  });

  it('keeps the service message for a game that is no longer scheduled', async () => {
    fake.state.game = { ...openGame(), gameStatus: 3 };

    const res = await post({ userId: USER_ID, gameId: '0022600128', side: 'home' }).expect(400);

    expect(res.body.message).toBe('Picks are closed: this game is no longer scheduled.');
    expect(fake.state.inserts).toEqual([]);
  });

  it('404s for an unknown game', async () => {
    fake.state.game = null;

    const res = await post({ userId: USER_ID, gameId: 'nope', side: 'home' }).expect(404);

    expect(res.body.message).toContain("Game 'nope' not found");
    expect(fake.state.inserts).toEqual([]);
  });

  it('404s for an unknown user instead of surfacing a foreign key error', async () => {
    fake.state.userExists = false;

    const res = await post({ userId: 'ghost', gameId: '0022600128', side: 'home' }).expect(404);

    expect(res.body.message).toContain("User 'ghost' not found");
    expect(fake.state.inserts).toEqual([]);
  });

  it('401s without a token', async () => {
    await post({ userId: USER_ID, gameId: '0022600128', side: 'home' }, null).expect(401);

    expect(fake.state.inserts).toEqual([]);
  });

  it('401s with the wrong token', async () => {
    await post({ userId: USER_ID, gameId: '0022600128', side: 'home' }, 'not-the-token').expect(
      401,
    );

    expect(fake.state.inserts).toEqual([]);
  });

  it('400s on a validation failure and writes nothing', async () => {
    await post({ userId: USER_ID, gameId: '0022600128', side: 'sideways' }).expect(400);
    await post({ gameId: '0022600128', side: 'home' }).expect(400);
    await post({ userId: '  ', gameId: '0022600128', side: 'home' }).expect(400);

    expect(fake.state.inserts).toEqual([]);
  });

  it('refuses the (N+1)th attempt inside the throttle window', async () => {
    const body = { userId: USER_ID, gameId: '0022600128', side: 'home' };

    for (let attempt = 0; attempt < PICK_THROTTLE_LIMIT; attempt++) {
      await post(body).expect(201);
    }

    const refused = await post(body).expect(429);

    expect(refused.body.message).toMatch(/^Too many pick attempts\. Try again in \d+s\.$/);
    // Only the allowed attempts reached the write path.
    expect(fake.state.inserts).toHaveLength(PICK_THROTTLE_LIMIT * 2);
  });
});
