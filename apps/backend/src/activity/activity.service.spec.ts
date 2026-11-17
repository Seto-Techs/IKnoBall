import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscordLinkService } from '../discord-link/discord-link.service';
import { ActivityService } from './activity.service';

/**
 * The activity's sign-in is the one place a Discord identity becomes an IKnoBall
 * session, so these tests hold the two things that matter: an unlinked Discord
 * account never gets a session, and a code that Discord will not honour never
 * reaches the account lookup at all.
 */

const USER_ID = 'usr_1';

function makeService(options: { userId?: string | null; userExists?: boolean } = {}) {
  const resolve = vi.fn(async () => ({
    userId: options.userId === undefined ? USER_ID : options.userId,
    source: 'link' as const,
  }));
  const createSession = vi.fn(async () => ({ token: 'session-token' }));
  const findUserById = vi.fn(async () =>
    options.userExists === false
      ? null
      : { id: USER_ID, name: 'Raka', image: 'https://example.test/avatar.png' },
  );

  const auth = {
    instance: {
      $context: Promise.resolve({ internalAdapter: { createSession, findUserById } }),
    },
  };

  const service = new ActivityService(
    { resolve } as unknown as DiscordLinkService,
    auth as unknown as AuthService,
  );

  return { service, resolve, createSession, findUserById };
}

/** One response per fetch call, in order. */
function stubDiscord(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let index = 0;

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[index++] ?? { status: 500, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  });

  return calls;
}

describe('ActivityService.createSession', () => {
  const original = { id: process.env.DISCORD_CLIENT_ID, secret: process.env.DISCORD_CLIENT_SECRET };

  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = '1531941991875743744';
    process.env.DISCORD_CLIENT_SECRET = 'client-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original.id === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = original.id;
    if (original.secret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = original.secret;
  });

  it('trades the code for a session on the linked account', async () => {
    const calls = stubDiscord([
      { status: 200, body: { access_token: 'discord-access-token' } },
      { status: 200, body: { id: 'discord-1', username: 'raka', global_name: 'Raka' } },
    ]);
    const { service, resolve, createSession } = makeService();

    const session = await service.createSession('oauth-code');

    // The code goes to Discord's token endpoint with the app's own credentials,
    // not the client's.
    expect(calls[0].url).toBe('https://discord.com/api/v10/oauth2/token');
    const body = calls[0].init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('oauth-code');
    expect(body.get('client_id')).toBe('1531941991875743744');

    // The user is read with the access token the exchange returned.
    expect(calls[1].url).toBe('https://discord.com/api/v10/users/@me');
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe(
      'Bearer discord-access-token',
    );

    expect(resolve).toHaveBeenCalledWith('discord-1');
    expect(createSession).toHaveBeenCalledWith(USER_ID);
    expect(session).toEqual({
      token: 'session-token',
      discord: { id: 'discord-1', name: 'Raka' },
      user: { id: USER_ID, name: 'Raka', image: 'https://example.test/avatar.png' },
    });
  });

  it('falls back to the username when Discord has no global name', async () => {
    stubDiscord([
      { status: 200, body: { access_token: 'at' } },
      { status: 200, body: { id: 'discord-2', username: 'raka_2', global_name: '   ' } },
    ]);
    const { service } = makeService();

    const session = await service.createSession('oauth-code');

    expect(session.discord.name).toBe('raka_2');
  });

  it('refuses an unlinked Discord account without minting a session', async () => {
    stubDiscord([
      { status: 200, body: { access_token: 'at' } },
      { status: 200, body: { id: 'discord-3', username: 'stranger' } },
    ]);
    const { service, createSession } = makeService({ userId: null });

    await expect(service.createSession('oauth-code')).rejects.toBeInstanceOf(ForbiddenException);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects a code Discord will not exchange, before any account lookup', async () => {
    stubDiscord([{ status: 400, body: { error: 'invalid_grant' } }]);
    const { service, resolve, createSession } = makeService();

    await expect(service.createSession('spent-code')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects when Discord accepts the code but will not return the user', async () => {
    stubDiscord([
      { status: 200, body: { access_token: 'at' } },
      { status: 401, body: { message: '401: Unauthorized' } },
    ]);
    const { service, resolve } = makeService();

    await expect(service.createSession('oauth-code')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('says so when the deployment has no Discord credentials', async () => {
    delete process.env.DISCORD_CLIENT_SECRET;
    const calls = stubDiscord([]);
    const { service } = makeService();

    await expect(service.createSession('oauth-code')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(calls).toHaveLength(0);
  });
});
