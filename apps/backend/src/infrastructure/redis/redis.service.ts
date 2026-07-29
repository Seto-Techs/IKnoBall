import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private loggingClient: RedisClientType | null = null;
  private readonly redisUrl: string;
  private readonly redisLoggingUrl: string;

  constructor() {
    this.redisUrl = process.env.REDIS_URL || '';
    this.redisLoggingUrl = process.env.REDIS_LOGGING_URL || '';
  }

  async onModuleInit() {
    this.connect().catch((err) => {
      this.logger.error('Redis initialization failed, will retry in background', err);
    });
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Initialize Redis connections
   */
  async connect(): Promise<void> {
    // Connect General Client
    if (!this.client || !this.client.isOpen) {
      if (!this.redisUrl) {
        this.logger.error('REDIS_URL environment variable is not set');
        return;
      }
      this.client = await this.createRedisClient(this.redisUrl, 'General');
    }

    // Connect Logging Client
    if (!this.loggingClient || !this.loggingClient.isOpen) {
      if (!this.redisLoggingUrl) {
        this.logger.warn('REDIS_LOGGING_URL not set. Logging to Redis will fail.');
      } else {
        this.loggingClient = await this.createRedisClient(this.redisLoggingUrl, 'Logging');
      }
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      const ttl = await client.ttl(key);
      return ttl;
    } catch (error) {
      this.logger.error('Redis: Failed to get key', error);
      throw error;
    }
  }

  private async createRedisClient(url: string, name: string): Promise<RedisClientType> {
    const client = createClient({
      url: url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 50) {
            this.logger.warn(
              `Redis (${name}): ${retries} reconnection attempts, still trying every 5s`,
            );
            return 5000;
          }
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 10000,
      },
    }) as RedisClientType;

    client.on('error', (err) => this.logger.error(`Redis (${name}) Client Error:`, err));
    client.on('connect', () => this.logger.log(`Redis (${name}): Connecting...`));
    client.on('ready', () => this.logger.log(`Redis (${name}): Connection ready`));
    client.on('reconnecting', () => this.logger.log(`Redis (${name}): Reconnecting...`));
    client.on('end', () => this.logger.log(`Redis (${name}): Connection ended`));

    client.connect().catch((err) => {
      this.logger.error(`Redis (${name}): Initial connect failed, retrying...`, err);
    });
    return client;
  }

  /**
   * Get the General Redis client instance
   */
  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    return this.client;
  }

  /**
   * Close Redis connections
   */
  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
      this.client = null;
      this.logger.log('Redis (General): Connection closed');
    }
    if (this.loggingClient && this.loggingClient.isOpen) {
      await this.loggingClient.quit();
      this.loggingClient = null;
      this.logger.log('Redis (Logging): Connection closed');
    }
  }

  /**
   * Check if General Redis is connected
   */
  isConnected(): boolean {
    return this.client !== null && (this.client.isOpen || this.client.isReady);
  }

  /**
   * Get a key from General Redis
   */
  async getKey(key: string): Promise<string> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      if (!(await client.exists(key))) {
        throw new Error(`Key ${key} not found`);
      }
      const value = await client.get(key);
      if (value === null) {
        throw new Error(`Key ${key} not found`);
      }
      return value;
    } catch (error) {
      this.logger.error('Redis: Failed to get key', error);
      throw error;
    }
  }

  /**
   * Set a key in General Redis
   */
  async setKey(key: string, value: string | number, expiration?: number): Promise<void> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      if (expiration) {
        await client.set(key, value, { EX: expiration });
      } else {
        await client.set(key, value);
      }
    } catch (error) {
      this.logger.error('Redis: Failed to set key', error);
      throw error;
    }
  }

  /**
   * Delete a key from General Redis
   */
  async deleteKey(key: string): Promise<void> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      await client.del(key);
    } catch (error) {
      this.logger.error('Redis: Failed to delete key', error);
      throw error;
    }
  }

  /**
   * Check if a key exists in General Redis
   */
  async keyExists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      const exists = await client.exists(key);
      return exists > 0;
    } catch (error) {
      this.logger.error('Redis: Failed to check key existence', error);
      throw error;
    }
  }

  /**
   * Insert to Zset in General Redis
   */
  async insertToZset(key: string, value: string, expiration?: number): Promise<void> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      // zadd score = expiration time in unix
      if (expiration) {
        await client.zAdd(key, { score: Date.now() + expiration, value: value });
      } else {
        await client.zAdd(key, { score: Date.now(), value: value });
      }
    } catch (error) {
      this.logger.error('Redis: Failed to insert to list', error);
      throw error;
    }
  }

  /**
   * Get zset from General Redis
   */
  async getZset(key: string): Promise<string[]> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      const value = await client.zRange(key, 0, -1);
      return value;
    } catch (error) {
      this.logger.error('Redis: Failed to get zset', error);
      throw error;
    }
  }

  async getKeyFromZset(key: string): Promise<string[] | null> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      const value = await client.zRange(key, 0, 0);
      return value;
    } catch (error) {
      this.logger.error('Redis: Failed to get key from zset', error);
      throw error;
    }
  }

  async deleteKeyFromZset(key: string, value: string): Promise<void> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const client = this.getClient();
      await client.zRem(key, value);
    } catch (error) {
      this.logger.error('Redis: Failed to delete key from zset', error);
      throw error;
    }
  }

  /**
   * Push to Logging Redis List
   */
  async lpushLogging(key: string, value: string): Promise<number> {
    try {
      if (!this.loggingClient || !this.loggingClient.isOpen) {
        await this.connect();
        if (!this.loggingClient) {
          throw new Error('Logging Redis client not available');
        }
      }
      return await this.loggingClient.lPush(key, value);
    } catch (error) {
      this.logger.error('Redis (Logging): Failed to lpush', error);
      throw error;
    }
  }
}
