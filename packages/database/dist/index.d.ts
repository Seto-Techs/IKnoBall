import { Pool } from 'pg';
import * as schema from './schema.js';
export * from './schema.js';
export declare function createDatabase(connectionString?: string | undefined): {
    db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
        $client: Pool;
    };
    pool: Pool;
};
export type Database = ReturnType<typeof createDatabase>['db'];
