import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { betterAuth } from 'better-auth';
import request from 'supertest';
import { App } from 'supertest/types';

const password = 'valid-password-123';
const email = 'player@iknoball.test';

function testAuth(mail: { verify: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }) {
  return betterAuth({
    baseURL: 'http://localhost:3000',
    basePath: '/auth',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        mail.reset({ user, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }) => {
        mail.verify({ user, url });
      },
    },
  });
}

describe('Better Auth email-password flow (e2e)', () => {
  let app: INestApplication<App>;
  const mail = { verify: vi.fn(), reset: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ auth: testAuth(mail) })],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    await app.init();
  });

  it('signs up, blocks unverified login, verifies, signs in, fetches session, signs out, and sends reset mail', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/sign-up/email')
      .send({ name: 'Player', email, password })
      .expect(200);
    expect(mail.verify).toHaveBeenCalledOnce();

    await request(server)
      .post('/auth/sign-in/email')
      .send({ email, password })
      .expect(403);
    expect(mail.verify).toHaveBeenCalledTimes(2);

    const verificationUrl = new URL(mail.verify.mock.calls[0][0].url);
    await request(server)
      .get(`${verificationUrl.pathname}${verificationUrl.search}`)
      .expect(302);

    const signedIn = await request(server)
      .post('/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const cookie = signedIn.headers['set-cookie'];
    expect(cookie).toBeDefined();

    await request(server).get('/auth/get-session').set('Cookie', cookie).expect(200);
    await request(server).post('/auth/sign-out').set('Cookie', cookie).expect(200);
    await request(server).get('/auth/get-session').set('Cookie', cookie).expect(200).expect('null');

    await request(server)
      .post('/auth/request-password-reset')
      .send({ email, redirectTo: 'http://localhost:5173/reset-password' })
      .expect(200);
    expect(mail.reset).toHaveBeenCalledOnce();
  });

  it('rejects malformed credentials and does not send reset mail for an unknown email', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/sign-up/email')
      .send({ name: '', email: 'invalid', password: 'short' })
      .expect(400);
    await request(server)
      .post('/auth/sign-in/email')
      .send({ email: 'invalid', password: '' })
      .expect(400);
    await request(server)
      .post('/auth/request-password-reset')
      .send({ email: 'unknown@iknoball.test', redirectTo: 'http://localhost:5173/reset-password' })
      .expect(200);
    expect(mail.reset).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
  });
});
