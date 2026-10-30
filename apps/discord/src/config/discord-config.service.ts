import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiscordSettings } from './discord.config';

/**
 * Typed, validated view of the bot's environment.
 *
 * The constructor is where boot-time validation happens: a missing token throws
 * while Nest is still building the application context, so `main.ts` exits
 * non-zero instead of starting a bot that can never log in.
 */
@Injectable()
export class DiscordConfigService {
  private readonly logger = new Logger(DiscordConfigService.name);
  private readonly settings: DiscordSettings;

  constructor(config: ConfigService) {
    this.settings = config.getOrThrow<DiscordSettings>('discord');

    if (!this.settings.token) {
      throw new Error(
        'DISCORD_TOKEN is not set. The bot cannot log in without it — set it in apps/discord/.env or the project environment.',
      );
    }

    if (!this.settings.internalApiToken) {
      // Not fatal: the bot still serves commands that never call the API. Every
      // /internal call will 401 until this is set, so it must not be silent.
      this.logger.warn(
        'INTERNAL_API_TOKEN is not set: every bot → API /internal call will be rejected.',
      );
    }
  }

  get token(): string {
    return this.settings.token;
  }

  get apiUrl(): string {
    return this.settings.apiUrl;
  }

  get internalApiToken(): string {
    return this.settings.internalApiToken;
  }

  get enabled(): boolean {
    return this.settings.enabled;
  }
}
