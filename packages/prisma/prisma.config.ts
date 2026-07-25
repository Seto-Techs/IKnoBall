import "dotenv/config";
import { defineConfig } from "@prisma/config";

const url = process.env.DATABASE_URL ?? "postgresql://localhost:5432/iknoball";

export default defineConfig({
  schema: "../schema/schema",
  migrations: {
    path: "../schema/migrations",
  },
  datasource: {
    url,
    shadowDatabaseUrl: process.env.DATABASE_URL_SHADOW,
  },
});
