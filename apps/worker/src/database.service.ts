import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '@iknoball/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client = createDatabase();
  readonly db = this.client.db;

  async onModuleDestroy() {
    await this.client.pool.end();
  }
}
