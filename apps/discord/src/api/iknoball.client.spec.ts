import { afterEach, describe, expect, it, vi } from 'vitest';
import { IknoballClient } from './iknoball.client';
import { ApiError } from './errors';
import type { DiscordConfigService } from '../config/discord-config.service';

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

describe('IknoballClient', () => {
  it('calls POST /api/internal/health with the internal token and unwraps the envelope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { is_success: true, message: 'ok', data: { status: 'ok' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new IknoballClient(config).health();

    expect(result).toEqual({ status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // The backend's global `api` prefix is the client's business, not the caller's.
    expect(url).toBe('http://api:3000/api/internal/health');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('shared-secret');
  });

  it('surfaces a non-2xx as a typed error carrying the status and the API message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          is_success: false,
          message: 'Invalid internal token',
          data: null,
        }),
      ),
    );

    const call = new IknoballClient(config).health();

    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toMatchObject({
      status: 401,
      path: '/internal/health',
      message: '/internal/health failed with 401: Invalid internal token',
    });
  });

  it('maps a transport failure to status 0 so callers can treat it like a 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(new IknoballClient(config).health()).rejects.toMatchObject({
      status: 0,
      path: '/internal/health',
    });
  });

  it('POSTs a pick and unwraps both rows', async () => {
    const rows = [
      { gameId: '0022600128', mode: 'flat', side: 'home' },
      { gameId: '0022600128', mode: 'weighted', side: 'home' },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(201, { is_success: true, message: 'Pick saved.', data: rows }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new IknoballClient(config).placePick({
      userId: 'user_1',
      gameId: '0022600128',
      side: 'home',
    });

    expect(result).toEqual(rows);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/predictions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('shared-secret');
    expect(JSON.parse(init.body as string)).toEqual({
      userId: 'user_1',
      gameId: '0022600128',
      side: 'home',
    });
  });

  it('GETs a user’s picks with the userId encoded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { is_success: true, message: 'Picks fetched.', data: [] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new IknoballClient(config).listPicks({ userId: 'a b&c' });

    expect(result).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/picks?userId=a%20b%26c');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('GETs a server’s leaderboard with guildId and mode as query parameters', async () => {
    const rows = [{ rank: 1, userId: 'user_1', name: 'finny', points: 76, picks: 7, correct: 4 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { is_success: true, message: 'Leaderboard fetched.', data: rows }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new IknoballClient(config).leaderboard({
      guildId: 'guild 1',
      mode: 'weighted',
    });

    expect(result).toEqual(rows);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/leaderboard?guildId=guild+1&mode=weighted');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('shared-secret');
  });

  it("adds the caller's Discord id so the API can append their own row", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { is_success: true, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new IknoballClient(config).leaderboard({
      guildId: 'guild-1',
      mode: 'flat',
      viewerDiscordUserId: '123 456',
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api:3000/api/internal/leaderboard?guildId=guild-1&mode=flat&viewerDiscordUserId=123+456',
    );
  });

  it('resolves a Discord account with the id encoded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { is_success: true, message: 'Link resolved.', data: { userId: null } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new IknoballClient(config).resolveLink({ discordUserId: 'd 1' });

    expect(result).toEqual({ userId: null });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/discord-link?discordUserId=d%201');
    expect(init.method).toBe('GET');
  });
});
