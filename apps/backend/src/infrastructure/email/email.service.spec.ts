import { EmailService } from './email.service';

const { rPush, quit, connect, on, createClient } = vi.hoisted(() => {
  const rPush = vi.fn().mockResolvedValue(1);
  const quit = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  const createClient = vi.fn(() => ({ connect, rPush, quit, on, isOpen: true }));
  return { rPush, quit, connect, on, createClient };
});

vi.mock('redis', () => ({ createClient }));

describe('EmailService auth messages', () => {
  const smtp = { send: vi.fn() };
  const config = {
    get: vi.fn((key: string) => {
      const values: Record<string, unknown> = {
        'emailQueue.redisUrl': 'redis://queue.iknoball.test:6379/0',
        'emailQueue.key': 'queue:iknoball-email',
        'emailQueue.internalToken': 'internal-token',
        'emailQueue.fromName': 'IKnoBall',
        'emailQueue.fromAddressMap': {
          verify: 'verify@iknoball.test',
          reset: 'reset@iknoball.test',
          loginOtp: 'no-reply@iknoball.test',
          reminder: 'reminder@iknoball.test',
        },
      };
      return values[key];
    }),
  };
  const email = new EmailService(smtp as never, config as never);

  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['sendVerifyEmail', 'verify@iknoball.test', 'Verify Account'],
    ['sendPasswordResetEmail', 'reset@iknoball.test', 'Reset Password'],
  ] as const)('queues %s for the existing email worker', async (method, address, buttonText) => {
    await email[method]({
      to: 'player@iknoball.test',
      name: 'Player',
      link: 'https://app.iknoball.test/action',
      subject: 'Action required',
      fromKey: method === 'sendVerifyEmail' ? 'verify' : 'reset',
    });

    expect(connect).toHaveBeenCalledOnce();
    expect(rPush).toHaveBeenCalledWith(
      'queue:iknoball-email',
      expect.stringContaining('internal-token'),
    );
    expect(JSON.parse(rPush.mock.calls[0][1])).toMatchObject({
      from: { address, name: 'IKnoBall' },
      to: [{ email_address: { address: 'player@iknoball.test', name: 'Player' } }],
      subject: 'Action required',
      internal_token: 'internal-token',
      htmlbody: expect.stringContaining(buttonText),
    });
    expect(smtp.send).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('fails fast instead of hanging when the queue host is unreachable', async () => {
    // The sign-up request waits on this call. node-redis retries a dropped
    // connection forever by default, so without a bounded connect the request
    // never returns — which is exactly how a firewalled queue showed up in
    // production: a spinner on "creating account" and no error anywhere.
    connect.mockRejectedValueOnce(new Error('Connection timeout'));

    await expect(
      email.sendVerifyEmail({
        to: 'player@iknoball.test',
        name: 'Player',
        link: 'https://app.iknoball.test/action',
        subject: 'Verify',
        fromKey: 'verify',
      }),
    ).rejects.toThrow('Connection timeout');

    expect(rPush).not.toHaveBeenCalled();
    const options = createClient.mock.calls[0][0] as {
      socket: { connectTimeout: number; reconnectStrategy: boolean };
    };
    expect(options.socket.reconnectStrategy).toBe(false);
    expect(options.socket.connectTimeout).toBeGreaterThan(0);
  });

  it('rejects auth email when queue configuration is incomplete', async () => {
    const incomplete = new EmailService(smtp as never, { get: vi.fn(() => undefined) } as never);

    await expect(
      incomplete.sendVerifyEmail({
        to: 'player@iknoball.test',
        name: 'Player',
        link: 'https://app.iknoball.test/action',
        subject: 'Verify',
        fromKey: 'verify',
      }),
    ).rejects.toThrow('Email queue config is incomplete');
  });
});
