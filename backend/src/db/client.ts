import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** Migrations live in backend/drizzle; every entry point (next, vitest, tsx) runs from backend/. */
const migrationsFolder = path.join(process.cwd(), "drizzle");

/**
 * With a URL: a real Postgres (Neon in production, a CI service in tests).
 * Without one: PGlite, a real Postgres running inside this process. `dataDir` keeps it on
 * disk between runs (local dev); leave it out for a throwaway in-memory database (tests).
 */
export function openDatabase(opts: { url?: string; dataDir?: string } = {}): Database {
  if (opts.url) {
    const sql = postgres(opts.url, { prepare: false, max: 5, onnotice: () => {} });
    const db = drizzlePostgres(sql, { schema }) as unknown as Db;
    return {
      db,
      migrate: () => migratePostgres(db as never, { migrationsFolder }),
      close: () => sql.end(),
    };
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    migrate: () => migratePglite(db as never, { migrationsFolder }),
    close: () => client.close(),
  };
}
