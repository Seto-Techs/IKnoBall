import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscordConfigService } from '../config/discord-config.service';
import type { InteractionRouter } from '../interactions/router';

/**
 * Where the boot-time command PUT lands.
 *
 * Two scopes, one code path, and getting it wrong is quiet: register globally on
 * a dev bot and a half-finished command is live for real users; register
 * guild-scoped in production and every command disappears from every server but
 * one. So the assertions are on the REST call discord.js would make, which is
 * the only thing this class produces.
 */

const api = vi.hoisted(() => ({
  set: vi.fn(async () => undefined),
  fetch: vi.fn(async () => new Map()),
}));

vi.mock('discord.js', () => {
  class Client {
    application = { commands: { set: api.set, fetch: api.fetch } };
    user = { tag: 'dev-bot#0001' };
    guilds = { cache: new Map() };
    private ready?: (client: unknown) => void;

    on(): this {
      return this;
    }

    once(event: string, handler: (client: unknown) => void): this {
      if (event === 'clientReady') this.ready = handler;
      return this;
    }

    async login(): Promise<void> {
      this.ready?.(this);
    }

    destroy(): void {}
  }

  return {
    Client,
    Events: { InteractionCreate: 'interactionCreate', Error: 'error', ClientReady: 'clientReady' },
    GatewayIntentBits: { Guilds: 1, GuildMembers: 2 },
    ApplicationCommandType: { PrimaryEntryPoint: 4 },
    EntryPointCommandHandlerType: { DiscordLaunchActivity: 1 },
  };
});

const { DiscordClientService } = await import('./discord-client.service');

const DEFINITIONS = [
  { name: 'ping', description: 'Is the bot alive?' },
  { name: 'picks', description: 'Your picks' },
];

function harness(devGuildId?: string) {
  const router = { commandDefinitions: () => DEFINITIONS } as unknown as InteractionRouter;
  const config = { devGuildId, enabled: true } as unknown as DiscordConfigService;
  return new DiscordClientService(config, router);
}

describe('DiscordClientService command registration', () => {
  beforeEach(() => {
    api.set.mockClear();
    api.fetch.mockClear();
  });

  it('aims the bulk overwrite at the dev guild, and never reads global commands', async () => {
    await harness('guild-123').start();

    await vi.waitFor(() => expect(api.set).toHaveBeenCalled());
    expect(api.set.mock.calls[0]).toEqual([DEFINITIONS, 'guild-123']);
    // The entry-point fetch is a global-only concern; a guild PUT must not pay for it.
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('registers globally, carrying the Activity entry point through, when no dev guild is set', async () => {
    const entryPoint = {
      name: 'iknoball',
      description: 'Play IKnoBall',
      type: 4,
      handler: 1,
    };
    api.fetch.mockResolvedValueOnce(new Map([['entry', entryPoint]]));

    await harness(undefined).start();

    await vi.waitFor(() => expect(api.set).toHaveBeenCalled());
    const [payload, guildId] = api.set.mock.calls[0] as [unknown[], string | undefined];
    expect(guildId).toBeUndefined();
    expect(payload).toEqual([
      {
        name: 'iknoball',
        description: 'Play IKnoBall',
        type: 4,
        handler: 1,
        integrationTypes: undefined,
        contexts: undefined,
      },
      ...DEFINITIONS,
    ]);
  });
});
