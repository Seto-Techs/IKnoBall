import { describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { LaunchCommand } from './iknoball.command';

function interaction(launchActivity: () => Promise<unknown>) {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1' },
    launchActivity: vi.fn(launchActivity),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LaunchCommand', () => {
  it('is registered as /iknoball', () => {
    const data = new LaunchCommand().data.toJSON();

    expect(data.name).toBe('iknoball');
    expect(data.type).toBe(1);
  });

  it('launches the activity as the first response, answering nothing else', async () => {
    const fake = interaction(() => Promise.resolve(undefined));

    await new LaunchCommand().execute(fake as unknown as ChatInputCommandInteraction);

    // Discord only accepts LAUNCH_ACTIVITY as the *initial* response: a reply or
    // defer first would spend the acknowledgement and the launch would be refused.
    expect(fake.launchActivity).toHaveBeenCalledOnce();
    expect(fake.reply).not.toHaveBeenCalled();
  });

  it('explains a refused launch instead of leaving the user with nothing', async () => {
    const fake = interaction(() => Promise.reject(new Error('Activities are not supported')));

    await new LaunchCommand().execute(fake as unknown as ChatInputCommandInteraction);

    expect(fake.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('could not open here'),
      flags: MessageFlags.Ephemeral,
    });
  });
});
