import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '@iknoball/database';
import { sql } from 'drizzle-orm';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client = createDatabase();
  readonly db = this.client.db;

  async onModuleDestroy() {
    await this.client.pool.end();
  }

  async testConnection() {
    await this.db.execute(sql`SELECT 1`);
  }
}
