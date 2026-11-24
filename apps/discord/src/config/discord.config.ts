import { registerAs } from '@nestjs/config';

export interface DiscordSettings {
  token: string;
  apiUrl: string;
  internalApiToken: string;
  enabled: boolean;
  /**
   * A dev/test guild to register slash commands in.
   *
   * Set only for a local bot: guild commands land instantly, while a global PUT
   * waits on Discord's propagation. Unset in every deployed environment, where
   * commands belong to the whole application.
   */
  devGuildId?: string;
}

/** `DISCORD_ENABLED=false` is the kill switch (DISC-14); anything else runs. */
function readEnabled(raw: string | undefined): boolean {
  return (raw ?? 'true').trim().toLowerCase() !== 'false';
}

/** Origin only. The backend mounts everything under a global `api` prefix. */
function readApiUrl(raw: string | undefined): string {
  const value = (raw ?? 'http://localhost:3000').trim();
  return value.replace(/\/+$/, '');
}

/** Empty or whitespace means "not a dev bot", not "guild 0". */
function readDevGuildId(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  return value === '' ? undefined : value;
}

export const discordConfig = registerAs('discord', () => ({
  token: (process.env.DISCORD_TOKEN ?? '').trim(),
  apiUrl: readApiUrl(process.env.IKNOBALL_API_URL),
  internalApiToken: (process.env.INTERNAL_API_TOKEN ?? '').trim(),
  enabled: readEnabled(process.env.DISCORD_ENABLED),
  devGuildId: readDevGuildId(process.env.DISCORD_DEV_GUILD_ID),
}));
