import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import { issueLinkCode, unlinkDiscord } from './linking.api';

const config = {
  apiUrl: 'http://api:3000',
  internalApiToken: 'shared-secret',
} as unknown as DiscordConfigService;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('issueLinkCode', () => {
  it('POSTs the Discord id and unwraps the code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        is_success: true,
        message: 'Linking code issued.',
        data: { code: 'ABC234', expiresInSeconds: 600 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const issued = await issueLinkCode(config, 'discord-1');

    expect(issued).toEqual({ code: 'ABC234', expiresInSeconds: 600 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/discord-link/code');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('shared-secret');
    expect(JSON.parse(init.body as string)).toEqual({ discordUserId: 'discord-1' });
  });

  it('surfaces a 503 with the API message, so the command can say "not answering"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(503, {
          is_success: false,
          message: 'Could not issue a linking code. Try again.',
          data: null,
        }),
      ),
    );

    await expect(issueLinkCode(config, 'discord-1')).rejects.toMatchObject({
      status: 503,
      path: '/internal/discord-link/code',
      message:
        '/internal/discord-link/code failed with 503: Could not issue a linking code. Try again.',
    });
  });
});

describe('unlinkDiscord', () => {
  it('DELETEs by Discord id with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        is_success: true,
        message: 'Link removed.',
        data: { removed: true, stillResolvable: false },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await unlinkDiscord(config, 'a b&c');

    expect(result).toEqual({ removed: true, stillResolvable: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/discord-link?discordUserId=a%20b%26c');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('maps a transport failure to status 0, like the pick client does', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(unlinkDiscord(config, 'discord-1')).rejects.toMatchObject({ status: 0 });
  });
});
