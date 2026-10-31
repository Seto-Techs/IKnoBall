import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Client } from 'discord.js';
import type IORedis from 'ioredis';
import type { Database } from '@iknoball/database';
import { IknoballClient } from '../api/iknoball.client';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RedisService } from '../infrastructure/redis.service';

/**
 * The trunk's infrastructure, resolved late.
 *
 * `app.module.ts` declares `DatabaseService`, `RedisService`, and
 * `DiscordClientService` as its own providers and exports nothing, and it is
 * trunk wiring this chunk must not edit. A provider in an imported module cannot
 * inject them, so this class asks the container for the same singletons through
 * `ModuleRef.get(…, { strict: false })` — exactly how `InteractionRouter`
 * resolves handlers it does not own.
 *
 * One class rather than a `ModuleRef` in every service: this is the only place
 * the workaround lives, and it resolves each dependency once, so the bot keeps
 * one database pool, one Redis connection, and one gateway client.
 */
@Injectable()
export class Infrastructure {
  private database?: Database;
  private redisClient?: IORedis;
  private discordClient?: Client;
  private iknoball?: IknoballClient;

  constructor(private readonly moduleRef: ModuleRef) {}

  /** The shared Drizzle client (one `pg` pool for the whole process). */
  get db(): Database {
    this.database ??= this.moduleRef.get(DatabaseService, { strict: false }).db;
    return this.database;
  }

  /** The shared ioredis connection. */
  get redis(): IORedis {
    this.redisClient ??= this.moduleRef.get(RedisService, { strict: false }).getClient();
    return this.redisClient;
  }

  /**
   * The gateway client, for fetching channels and sending messages.
   *
   * Never used to log in: `main.ts` starts the client it resolves from the
   * container, and this getter hands back that same instance.
   */
  get client(): Client {
    this.discordClient ??= this.moduleRef.get(DiscordClientService, { strict: false }).client;
    return this.discordClient;
  }

  /**
   * The bot → API client.
   *
   * Same story: `IknoballClient` is a provider of `AppModule`, which exports nothing.
   * The rollover's recap asks the API for a guild's board, because the ranking is
   * the API's to compute — the bot must not grow a second definition of points.
   */
  get api(): IknoballClient {
    this.iknoball ??= this.moduleRef.get(IknoballClient, { strict: false });
    return this.iknoball;
  }
}
