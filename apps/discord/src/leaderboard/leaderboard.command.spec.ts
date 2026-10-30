import { describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { PredictionMode } from '@iknoball/predictions';
import type { IknoballClient } from '../api/iknoball.client';
import type { LeaderboardEntry } from '../api/types';
import { LeaderboardCommand } from './leaderboard.command';
import { BOARD_SIZE } from './leaderboard.embed';

/**
 * `/leaderboard` and the embed it replies with.
 *
 * The embed is the part worth pinning: it is what a server actually sees, and the
 * definition-B wording ("our members' points") has to survive any later edit,
 * because "points earned in this server" would describe the definition that was
 * rejected.
 */

function entry(rank: number, name: string, points: number, picks = 1): LeaderboardEntry {
  return { rank, userId: `user-${rank}`, name, points, picks, correct: Math.min(picks, 1) };
}

function fakeClient(rows: Partial<Record<PredictionMode, LeaderboardEntry[]>> = {}) {
  const leaderboard = vi.fn(async ({ mode }: { guildId: string; mode: PredictionMode }) => {
    return rows[mode] ?? [];
  });

  return { client: { leaderboard } as unknown as IknoballClient, leaderboard };
}

function commandInteraction(
  options: {
    guildId?: string | null;
    guildName?: string;
    mode?: PredictionMode | null;
  } = {},
) {
  const guildId = options.guildId === undefined ? 'guild-1' : options.guildId;
  const interaction = {
    guildId,
    guild: guildId ? { name: options.guildName ?? 'Hoops HQ' } : null,
    deferred: false,
    replied: false,
    options: { getString: (name: string) => (name === 'mode' ? (options.mode ?? null) : null) },
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply: vi.fn(async () => undefined),
    reply: vi.fn(async () => {
      interaction.replied = true;
    }),
  };

  return interaction;
}

type FakeInteraction = ReturnType<typeof commandInteraction>;

/** The single embed the command replied with. */
function embedOf(interaction: FakeInteraction) {
  const payload = interaction.editReply.mock.calls[0]?.[0] as
    | { embeds?: Record<string, unknown>[] }
    | undefined;
  const embed = payload?.embeds?.[0];
  if (!embed) throw new Error('the command did not reply with an embed');
  return embed as {
    title: string;
    description: string;
    fields: { name: string; value: string; inline: boolean }[];
    footer: { text: string };
  };
}

describe('LeaderboardCommand', () => {
  it("describes the board as our members' points, not points earned in this server", () => {
    const description = new LeaderboardCommand(fakeClient().client).data.toJSON().description;

    expect(description).toContain("members' points");
    expect(description.toLowerCase()).not.toContain('earned in this server');
  });

  it('replies publicly with both modes in one embed', async () => {
    const { client, leaderboard } = fakeClient({
      flat: [entry(1, 'Finny', 4, 14), entry(2, 'Raka', 1, 2)],
      weighted: [entry(1, 'Gangsit', 234, 42)],
    });
    const interaction = commandInteraction();

    await new LeaderboardCommand(client).execute(
      interaction as unknown as ChatInputCommandInteraction,
    );

    // Deferred and public: no ephemeral flag, and the board is a shared reply.
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply.mock.calls[0]).toEqual([]);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(leaderboard).toHaveBeenCalledTimes(2);
    expect(leaderboard).toHaveBeenCalledWith({ guildId: 'guild-1', mode: 'flat' });
    expect(leaderboard).toHaveBeenCalledWith({ guildId: 'guild-1', mode: 'weighted' });

    const embed = embedOf(interaction);
    expect(embed.title).toBe('Leaderboard');
    expect(embed.description).toContain("Our members' points");
    expect(embed.description).toContain('**Hoops HQ**');
    expect(embed.description).toContain('on the website or in Discord');
    expect(embed.fields.map((field) => field.name)).toEqual(['Flat points', 'Weighted points']);
    expect(embed.fields[0].value).toBe(
      '1. **Finny** · 4 pts · 14 picks\n2. **Raka** · 1 pt · 2 picks',
    );
    expect(embed.fields[1].value).toBe('1. **Gangsit** · 234 pts · 42 picks');
    expect(embed.footer.text).toContain('Top 10');
  });

  it("appends the caller's own row when the API returns one past the cut", async () => {
    const top = Array.from({ length: BOARD_SIZE }, (_, index) =>
      entry(index + 1, `Player ${index + 1}`, 100 - index),
    );
    // The API appends the caller as an eleventh row, at its true rank.
    const { client } = fakeClient({ flat: [...top, entry(12, 'Me', 7, 3)] });
    const interaction = commandInteraction({ mode: 'flat' });

    await new LeaderboardCommand(client).execute(
      interaction as unknown as ChatInputCommandInteraction,
    );

    const [field] = embedOf(interaction).fields;
    const lines = field.value.split('\n');

    expect(lines).toHaveLength(BOARD_SIZE + 2);
    expect(lines.at(-1)).toBe('Your row — 12. **Me** · 7 pts · 3 picks');
    expect(lines.join('\n')).not.toContain('11. **Me**');
  });

  it('shows only the requested mode', async () => {
    const { client, leaderboard } = fakeClient({ weighted: [entry(1, 'Finny', 76, 14)] });
    const interaction = commandInteraction({ mode: 'weighted' });

    await new LeaderboardCommand(client).execute(
      interaction as unknown as ChatInputCommandInteraction,
    );

    expect(leaderboard).toHaveBeenCalledTimes(1);
    expect(leaderboard).toHaveBeenCalledWith({ guildId: 'guild-1', mode: 'weighted' });
    expect(embedOf(interaction).fields.map((field) => field.name)).toEqual(['Weighted points']);
  });

  it('says so when nobody in the server has a settled pick', async () => {
    const interaction = commandInteraction();

    await new LeaderboardCommand(fakeClient().client).execute(
      interaction as unknown as ChatInputCommandInteraction,
    );

    expect(embedOf(interaction).fields.map((field) => field.value)).toEqual([
      'No settled picks yet.',
      'No settled picks yet.',
    ]);
  });

  it('refuses in a DM, where there is no membership to rank', async () => {
    const { client, leaderboard } = fakeClient();
    const interaction = commandInteraction({ guildId: null });

    await new LeaderboardCommand(client).execute(
      interaction as unknown as ChatInputCommandInteraction,
    );

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(leaderboard).not.toHaveBeenCalled();
  });
});
