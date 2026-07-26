import { createAuth } from './auth.config';

describe('Better Auth email configuration', () => {
  const email = {
    sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => vi.clearAllMocks());

  it('enables Discord when its credentials exist', () => {
    const original = { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET };
    process.env.DISCORD_CLIENT_ID = 'discord-client-id';
    process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret';

    const auth = createAuth(email as never);

    expect(auth.options.socialProviders?.discord).toMatchObject({
      clientId: 'discord-client-id',
      clientSecret: 'discord-client-secret',
      scope: ['identify', 'email'],
    });

    if (original.clientId === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = original.clientId;
    if (original.clientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = original.clientSecret;
  });

  it('does not enable Discord with incomplete credentials', () => {
    const original = { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET };
    process.env.DISCORD_CLIENT_ID = 'discord-client-id';
    delete process.env.DISCORD_CLIENT_SECRET;

    expect(createAuth(email as never).options.socialProviders).toBeUndefined();

    if (original.clientId === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = original.clientId;
    if (original.clientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = original.clientSecret;
  });

  it('requires verification and delegates verification/reset mail to EmailService', async () => {
    const auth = createAuth(email as never);
    const options = auth.options;
    const user = {
      id: 'user-1',
      name: 'Player',
      email: 'player@iknoball.test',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.emailVerification?.sendOnSignIn).toBe(true);

    await options.emailVerification?.sendVerificationEmail?.({
      user,
      url: 'https://api.iknoball.test/auth/verify-email?token=verify-token',
      token: 'verify-token',
    });
    await options.emailAndPassword?.sendResetPassword?.({
      user,
      url: 'https://api.iknoball.test/auth/reset-password?token=reset-token',
      token: 'reset-token',
    });

    expect(email.sendVerifyEmail).toHaveBeenCalledWith({
      to: user.email,
      name: user.name,
      link: expect.stringContaining('verify-token'),
      subject: 'Verify your IKnoBall account',
      fromKey: 'verify',
    });
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: user.email,
      name: user.name,
      link: expect.stringContaining('reset-token'),
      subject: 'Reset your IKnoBall password',
      fromKey: 'reset',
    });
  });
});
