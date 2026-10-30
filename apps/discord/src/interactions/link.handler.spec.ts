import { afterEach, describe, expect, it, vi } from 'vitest';
import { ButtonStyle, ComponentType, MessageFlags, type ButtonInteraction } from 'discord.js';
import { LinkHandler } from './link.handler';

const WEB_PAGE = 'https://iknoball.setotechs.com/settings/discord';

function buttonInteraction(customId = 'link:0022601194') {
  const interaction = {
    customId,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'discord-1' },
    replied: false,
    deferred: false,
    reply: vi.fn(async (_payload: unknown) => undefined),
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async (_payload: unknown) => undefined),
  };
  return interaction;
}

type FakeInteraction = ReturnType<typeof buttonInteraction>;

function asInteraction(interaction: FakeInteraction): ButtonInteraction {
  return interaction as unknown as ButtonInteraction;
}

interface ReplyPayload {
  content: string;
  components: { components: { type: number; style: number; label: string; url: string }[] }[];
}

function replyOf(interaction: FakeInteraction): ReplyPayload {
  const [payload] = interaction.reply.mock.calls[0] as [ReplyPayload];
  return payload;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkHandler', () => {
  it('answers ephemerally, in the reply rather than a defer', async () => {
    const interaction = buttonInteraction();

    await new LinkHandler().execute(asInteraction(interaction));

    expect(interaction.reply).toHaveBeenCalledOnce();
    const [payload] = interaction.reply.mock.calls[0] as [{ flags?: number }];
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('points a link button straight at the web linking page', async () => {
    const interaction = buttonInteraction();

    await new LinkHandler().execute(asInteraction(interaction));

    const [row] = replyOf(interaction).components;
    expect(row.components).toHaveLength(1);
    expect(row.components[0]).toMatchObject({
      type: ComponentType.Button,
      style: ButtonStyle.Link,
      url: WEB_PAGE,
    });
  });

  it('explains both ways in: Discord sign-in, or a code from /link', async () => {
    const interaction = buttonInteraction();

    await new LinkHandler().execute(asInteraction(interaction));

    const { content } = replyOf(interaction);
    expect(content).toContain('Link your account first');
    expect(content).toContain(WEB_PAGE);
    expect(content).toContain('`/link`');
  });

  it('makes no API call, so it works while the API is down', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new LinkHandler().execute(asInteraction(buttonInteraction()));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
