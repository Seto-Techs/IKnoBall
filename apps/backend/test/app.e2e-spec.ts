import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AllowAnonymous, AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from '../src/infrastructure/better-auth/auth.config';
import request from 'supertest';
import { App } from 'supertest/types';

@AllowAnonymous()
@Controller()
class HealthController {
  @Get()
  getHello() {
    return 'Hello World!';
  }
}

@Controller('protected')
class ProtectedController {
  @Get()
  getProtected() {
    return 'Protected';
  }
}

describe('Better Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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
      ],
      controllers: [HealthController, ProtectedController],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
  });

  it('allows anonymous health checks', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'));

  it('rejects protected routes without a session', () =>
    request(app.getHttpServer()).get('/protected').expect(401));

  it('rejects invalid sign-up input', () =>
    request(app.getHttpServer())
      .post('/auth/sign-up/email')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400));

  afterEach(async () => {
    await app.close();
  });
});
