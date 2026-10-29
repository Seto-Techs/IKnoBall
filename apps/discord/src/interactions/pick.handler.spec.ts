import { describe, expect, it, vi } from 'vitest';
import { ButtonStyle, MessageFlags, type ButtonInteraction } from 'discord.js';
import { ApiError, NotImplementedError } from '../api/errors';
import type { IknoballClient } from '../api/iknoball.client';
import type { PickResult, PickWithGameResult } from '../api/types';
import { DiscordConfigService } from '../config/discord-config.service';
import { PAUSED_REPLY } from '../ops/kill-switch';
import { PickHandler } from './pick.handler';

/** The kill switch as the handler reads it: one `enabled` field, on. */
const LIVE = { enabled: true } as unknown as DiscordConfigService;

/** The two rows `placePick` writes: flat (1 pt) and weighted (priced). */
function pickRows(side: 'home' | 'away' = 'home', decimal: number | null = 1.8): PickResult[] {
  const base = {
    gameId: '0022601194',
    side,
    lockedBook: null,
    lockedAt: null,
    points: null,
    status: 'pending',
    settledAt: null,
  };

  return [
    { ...base, mode: 'flat', lockedDecimal: null },
    { ...base, mode: 'weighted', lockedDecimal: decimal },
  ];
}

function fakeClient(
  overrides: {
    resolveLink?: (query: { discordUserId: string }) => Promise<{ userId: string | null }>;
    listPicks?: (query: { userId: string }) => Promise<PickWithGameResult[]>;
    placePick?: (input: {
      userId: string;
      gameId: string;
      side: 'home' | 'away';
    }) => Promise<PickResult[]>;
  } = {},
) {
  const resolveLink = vi.fn(overrides.resolveLink ?? (async () => ({ userId: 'user-1' })));
  const listPicks = vi.fn(overrides.listPicks ?? (async () => []));
  const placePick = vi.fn(overrides.placePick ?? (async () => pickRows()));

  return {
    client: { resolveLink, listPicks, placePick } as unknown as IknoballClient,
    resolveLink,
    listPicks,
    placePick,
  };
}

function buttonInteraction(options: {
  customId?: string;
  label?: string | null;
  userId?: string;
  guildId?: string | null;
  /** The card message the button lives on, as the interaction payload carries it. */
  cardButtons?: { customId: string; label: string }[];
}) {
  const interaction = {
    customId: options.customId ?? 'pick:0022601194:home',
    guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
    channelId: 'channel-1',
    user: { id: options.userId ?? 'discord-1' },
    message: {
      id: 'message-1',
      components: options.cardButtons ? [{ type: 1, components: options.cardButtons }] : undefined,
    },
    component: { label: options.label === undefined ? 'DAL' : options.label },
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
    deferUpdate: vi.fn(async () => undefined),
  };

  return interaction;
}

type FakeInteraction = ReturnType<typeof buttonInteraction>;

function asInteraction(interaction: FakeInteraction): ButtonInteraction {
  return interaction as unknown as ButtonInteraction;
}

function contentOf(interaction: FakeInteraction): string {
  const [payload] = interaction.editReply.mock.calls[0] as [{ content: string }];
  return payload.content;
}

describe('PickHandler', () => {
  it('acknowledges ephemerally before it calls the API, and never defers an update', async () => {
    const { client, placePick } = fakeClient();
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
    // The 3-second window: the ack must land before the first await on the API.
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      placePick.mock.invocationCallOrder[0],
    );
  });

  it('refuses the click and writes nothing while the kill switch is off', async () => {
    const { client, placePick, resolveLink } = fakeClient();
    const interaction = buttonInteraction({});
    const pausedConfig = { enabled: false } as unknown as DiscordConfigService;

    await new PickHandler(client, pausedConfig).execute(asInteraction(interaction));

    // Acked first, so the refusal is an ephemeral message rather than "interaction failed".
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(contentOf(interaction)).toBe(PAUSED_REPLY);
    // Nothing reached the API: no link lookup, no pick write.
    expect(resolveLink).not.toHaveBeenCalled();
    expect(placePick).not.toHaveBeenCalled();
  });

  it('confirms the pick with what it pays and two links', async () => {
    const { client, placePick } = fakeClient();
    const interaction = buttonInteraction({ label: 'DAL' });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).toHaveBeenCalledWith({
      userId: 'user-1',
      gameId: '0022601194',
      side: 'home',
    });
    expect(contentOf(interaction)).toBe(
      'Locked in: **DAL** · pays 18 pts if correct · changes until tip-off',
    );

    const [payload] = interaction.editReply.mock.calls[0] as [
      { components: { components: { label: string; url: string; style: ButtonStyle }[] }[] },
    ];
    const [row] = payload.components;
    expect(row.components.map((button) => button.label)).toEqual(['Change pick', 'Open on web']);
    expect(row.components.map((button) => button.url)).toEqual([
      'https://discord.com/channels/guild-1/channel-1/message-1',
      'https://iknoball.setotechs.com/game/0022601194',
    ]);
    expect(row.components.every((button) => button.style === ButtonStyle.Link)).toBe(true);
  });

  it('omits the jump link in a DM, where there is no message to jump to', async () => {
    const { client } = fakeClient();
    const interaction = buttonInteraction({ guildId: null });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    const [payload] = interaction.editReply.mock.calls[0] as [
      { components: { components: { label: string }[] }[] },
    ];
    expect(payload.components[0].components.map((button) => button.label)).toEqual(['Open on web']);
  });

  it('survives placePick() not being wired up yet', async () => {
    const { client } = fakeClient({
      placePick: async () => {
        throw new NotImplementedError('placePick');
      },
    });
    const interaction = buttonInteraction({});

    await expect(
      new PickHandler(client, LIVE).execute(asInteraction(interaction)),
    ).resolves.toBeUndefined();

    expect(contentOf(interaction)).toMatch(/saving is not wired up yet/i);
  });

  it('survives resolveLink() not being wired up yet, and writes nothing', async () => {
    const { client, placePick } = fakeClient({
      resolveLink: async () => {
        throw new NotImplementedError('resolveLink');
      },
    });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).not.toHaveBeenCalled();
    expect(contentOf(interaction)).toMatch(/saving is not wired up yet/i);
  });

  it('asks an unlinked user to /link instead of failing', async () => {
    const { client, placePick } = fakeClient({ resolveLink: async () => ({ userId: null }) });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).not.toHaveBeenCalled();
    expect(contentOf(interaction)).toContain('`/link`');
  });

  it('treats a 404 or 409 from the API as an unlinked account', async () => {
    for (const status of [404, 409]) {
      const { client } = fakeClient({
        placePick: async () => {
          throw new ApiError(status, 'no linked user', '/internal/predictions');
        },
      });
      const interaction = buttonInteraction({});

      await new PickHandler(client, LIVE).execute(asInteraction(interaction));

      expect(contentOf(interaction)).toContain('`/link`');
    }
  });

  it('treats a 400 as a closed game', async () => {
    const { client } = fakeClient({
      placePick: async () => {
        throw new ApiError(400, 'Picks are closed for this game', '/internal/predictions');
      },
    });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toBe('Picks are closed for this game — it has tipped off.');
  });

  it('treats a 429 as a throttle, not an outage', async () => {
    const { client } = fakeClient({
      placePick: async () => {
        throw new ApiError(429, 'Too many pick attempts.', '/internal/predictions');
      },
    });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toContain('Too many pick attempts');
  });

  it('does nothing at all when the same side is clicked twice', async () => {
    const { client, placePick } = fakeClient({
      listPicks: async () => [{ gameId: '0022601194', side: 'home' } as PickWithGameResult],
    });
    const interaction = buttonInteraction({ label: 'DAL' });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).not.toHaveBeenCalled();
    expect(contentOf(interaction)).toBe(
      'Already picked: **DAL** · nothing changed · changes until tip-off',
    );
  });

  it('says what it changed from when the user switches sides', async () => {
    const { client, placePick } = fakeClient({
      listPicks: async () => [{ gameId: '0022601194', side: 'away' } as PickWithGameResult],
    });
    const interaction = buttonInteraction({ label: 'DAL' });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).toHaveBeenCalledWith({
      userId: 'user-1',
      gameId: '0022601194',
      side: 'home',
    });
    // No card buttons on the fake payload, so the side is named generically.
    expect(contentOf(interaction)).toContain('Changed from your earlier pick on the other side.');
  });

  it('names the team it changed from by reading the card buttons', async () => {
    const { client } = fakeClient({
      listPicks: async () => [{ gameId: '0022601194', side: 'away' } as PickWithGameResult],
    });
    const interaction = buttonInteraction({
      label: 'DAL',
      cardButtons: [
        { customId: 'pick:0022601194:away', label: 'MEM' },
        { customId: 'pick:0022601194:home', label: 'DAL' },
      ],
    });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toContain('Changed from your earlier pick on **MEM**.');
  });

  it('still writes when the pick history cannot be read', async () => {
    const { client, placePick } = fakeClient({
      listPicks: async () => {
        throw new NotImplementedError('listPicks');
      },
    });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(placePick).toHaveBeenCalledTimes(1);
    expect(contentOf(interaction)).toContain('Locked in: **DAL**');
  });

  it('gives two users on the same card their own confirmation', async () => {
    const { client } = fakeClient();
    const handler = new PickHandler(client, LIVE);
    const away = buttonInteraction({
      customId: 'pick:0022601194:away',
      label: 'MEM',
      userId: 'discord-a',
    });
    const home = buttonInteraction({
      customId: 'pick:0022601194:home',
      label: 'DAL',
      userId: 'discord-b',
    });

    await handler.execute(asInteraction(away));
    await handler.execute(asInteraction(home));

    // Each confirmation lands on that clicker's own interaction and nobody else's.
    expect(contentOf(away)).toContain('Locked in: **MEM**');
    expect(contentOf(home)).toContain('Locked in: **DAL**');
    expect(away.editReply).toHaveBeenCalledTimes(1);
    expect(home.editReply).toHaveBeenCalledTimes(1);
  });

  it('rejects a custom_id it cannot parse without touching the API', async () => {
    const { client, placePick, resolveLink } = fakeClient();
    const interaction = buttonInteraction({ customId: 'pick:0022601194:draw' });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(resolveLink).not.toHaveBeenCalled();
    expect(placePick).not.toHaveBeenCalled();
    expect(contentOf(interaction)).toBe('That button is not a pick I understand.');
  });

  it('falls back to the side name when the button has no label', async () => {
    const { client } = fakeClient();
    const interaction = buttonInteraction({ label: null });

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toContain('Locked in: **Home**');
  });

  it('says the price is pending when the line has not opened yet', async () => {
    const { client } = fakeClient({ placePick: async () => pickRows('home', null) });
    const interaction = buttonInteraction({});

    await new PickHandler(client, LIVE).execute(asInteraction(interaction));

    expect(contentOf(interaction)).toContain('pays points once the line opens');
  });
});
