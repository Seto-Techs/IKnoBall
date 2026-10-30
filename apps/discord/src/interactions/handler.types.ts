import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

/**
 * The two handler shapes the registry holds.
 *
 * Handlers are Nest providers, so a chunk that needs a service (the API client,
 * Redis, the database) adds a constructor parameter and nothing else — the class
 * is already registered in `app.module.ts` and already named in the registry.
 */
export interface ButtonHandler {
  execute(interaction: ButtonInteraction): Promise<void>;
}

/**
 * Only what the router reads off a builder. Naming `SlashCommandBuilder` here
 * would reject any command that adds an option: discord.js narrows the builder to
 * `SlashCommandOptionsOnlyBuilder` as soon as `addStringOption` (etc.) is called.
 */
export type CommandData = Pick<SlashCommandBuilder, 'name' | 'toJSON'>;

export interface CommandHandler {
  /** Registered globally on client ready; also the source of the command's name. */
  readonly data: CommandData;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
