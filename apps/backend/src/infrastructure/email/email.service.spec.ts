import { EmailService } from './email.service';

const rPush = vi.fn().mockResolvedValue(1);
const quit = vi.fn().mockResolvedValue(undefined);
const connect = vi.fn().mockResolvedValue(undefined);

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({ connect, rPush, quit, isOpen: true })),
}));

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
