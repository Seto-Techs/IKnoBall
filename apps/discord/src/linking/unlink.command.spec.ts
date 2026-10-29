import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { DiscordConfigService } from '../config/discord-config.service';
import { UnlinkCommand } from './unlink.command';

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

function unlinkResponse(removed: boolean, stillResolvable: boolean): Response {
  return jsonResponse(200, {
    is_success: true,
    message: removed ? 'Link removed.' : 'No link to remove.',
    data: { removed, stillResolvable },
  });
}

function commandInteraction(userId = 'discord-1') {
  const interaction = {
    commandName: 'unlink',
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

function contentOf(interaction: FakeInteraction): string {
  const [payload] = interaction.editReply.mock.calls[0] as [{ content: string }];
  return payload.content;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UnlinkCommand', () => {
  it('acknowledges ephemerally and deletes by Discord id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unlinkResponse(true, false));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/internal/discord-link?discordUserId=discord-1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('says picks survive and no server is left', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unlinkResponse(true, false)));
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    const content = contentOf(interaction);
    expect(content).toContain('Unlinked');
    expect(content).toContain('picks are untouched');
    expect(content).toContain('stay in every server');
    // The caveat only belongs in the reply when it is true.
    expect(content).not.toContain('sign in to IKnoBall with Discord');
  });

  it('warns that a Discord sign-in user is still resolvable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unlinkResponse(true, true)));
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toContain('still land on it');
  });

  it('points a sign-in-only user at the profile instead of pretending it unlinked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unlinkResponse(false, true)));
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    const content = contentOf(interaction);
    expect(content).toContain('Nothing to unlink');
    expect(content).toContain('https://iknoball.setotechs.com/settings/discord');
  });

  it('offers /link to someone who was never linked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unlinkResponse(false, false)));
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    const content = contentOf(interaction);
    expect(content).toContain('Nothing to unlink');
    expect(content).toContain('Run `/link`');
  });

  it('does not claim a disconnect when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const interaction = commandInteraction();

    await new UnlinkCommand(config).execute(asInteraction(interaction));

    const content = contentOf(interaction);
    expect(content).toContain('nothing was unlinked');
    expect(content).not.toContain('Unlinked:');
  });
});
