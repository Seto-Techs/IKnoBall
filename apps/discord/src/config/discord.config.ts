import { registerAs } from '@nestjs/config';

export interface DiscordSettings {
  token: string;
  apiUrl: string;
  internalApiToken: string;
  enabled: boolean;
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

export const discordConfig = registerAs('discord', () => ({
  token: (process.env.DISCORD_TOKEN ?? '').trim(),
  apiUrl: readApiUrl(process.env.IKNOBALL_API_URL),
  internalApiToken: (process.env.INTERNAL_API_TOKEN ?? '').trim(),
  enabled: readEnabled(process.env.DISCORD_ENABLED),
}));
