import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { IknoballClient } from '../api/iknoball.client';
import type { DiscordConfigService } from '../config/discord-config.service';
import { LinkCommand } from './link.command';

const config = {
  apiUrl: 'http://api:3000',
  internalApiToken: 'shared-secret',
} as unknown as DiscordConfigService;

const WEB_PAGE = 'https://iknoball.setotechs.com/settings/discord';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The API's answer to `POST /internal/discord-link/code`. */
function codeResponse(code = 'ABC234', expiresInSeconds = 600): Response {
  return jsonResponse(200, {
    is_success: true,
    message: 'Linking code issued.',
    data: { code, expiresInSeconds },
  });
}

function fakeClient(
  resolveLink: (query: { discordUserId: string }) => Promise<{ userId: string | null }>,
) {
  const resolve = vi.fn(resolveLink);
  return { client: { resolveLink: resolve } as unknown as IknoballClient, resolve };
}

function commandInteraction(userId = 'discord-1') {
  const interaction = {
    commandName: 'link',
    user: { id: userId },
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async (_payload: unknown) => undefined),
    reply: vi.fn(async (_payload: unknown) => undefined),
  };
  return interaction;
}

type FakeInteraction = ReturnType<typeof commandInteraction>;

function asInteraction(interaction: FakeInteraction): ChatInputCommandInteraction {
  return interaction as unknown as ChatInputCommandInteraction;
}

interface ReplyPayload {
  content: string;
  components?: { components: { style: number; url: string; label: string }[] }[];
}

function replyOf(interaction: FakeInteraction): ReplyPayload {
  const [payload] = interaction.editReply.mock.calls[0] as [ReplyPayload];
  return payload;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkCommand', () => {
  it('acknowledges ephemerally before it calls the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(codeResponse()));
    const { client, resolve } = fakeClient(async () => ({ userId: null }));
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      resolve.mock.invocationCallOrder[0],
    );
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('hands out the code and a link to the page that spends it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(codeResponse('XYZ789'));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = fakeClient(async () => ({ userId: null }));
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    const reply = replyOf(interaction);
    expect(reply.content).toContain('**XYZ789**');
    expect(reply.content).toContain(`${WEB_PAGE}?code=XYZ789`);
    expect(reply.content).toContain('10 minutes');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/discord-link/code');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ discordUserId: 'discord-1' });
  });

  it('puts the same URL behind a link button, so the hop is one click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(codeResponse('XYZ789')));
    const { client } = fakeClient(async () => ({ userId: null }));
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    const [row] = replyOf(interaction).components ?? [];
    expect(row.components).toHaveLength(1);
    expect(row.components[0]).toMatchObject({
      type: ComponentType.Button,
      style: ButtonStyle.Link,
      url: `${WEB_PAGE}?code=XYZ789`,
    });
  });

  it('says the account is already linked instead of issuing a code', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = fakeClient(async () => ({ userId: 'user-1' }));
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    const reply = replyOf(interaction);
    expect(reply.content).toContain('already linked');
    expect(reply.components).toBeUndefined();
    // No code was minted, so there is nothing to leak into a stale DM.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells the user the API is down rather than handing out a broken code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(503, { is_success: false, message: 'Could not issue', data: null }),
        ),
    );
    const { client } = fakeClient(async () => ({ userId: null }));
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    expect(replyOf(interaction).content).toContain('not answering');
    expect(replyOf(interaction).components).toBeUndefined();
  });

  it('reports a failure to resolve without issuing a code', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = fakeClient(async () => {
      throw new Error('socket hang up');
    });
    const interaction = commandInteraction();

    await new LinkCommand(config, client).execute(asInteraction(interaction));

    expect(replyOf(interaction).content).toContain('Could not issue a linking code');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
