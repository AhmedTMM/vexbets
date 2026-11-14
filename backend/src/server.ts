import { type Database, openDatabase } from "./db/client";
import { type Deps, defaultConfig } from "./deps";
import { handlers } from "./handlers";
import { type Api, createApi } from "./http";

/**
 * The process-wide server used by the Next.js routes.
 * DATABASE_URL set: real Postgres (Neon on Vercel), migrated by `npm run db:migrate` at build.
 * Not set: PGlite on disk in backend/.pglite, migrated on start. Zero setup for local dev.
 */
let server: Promise<{ api: Api; deps: Deps; database: Database }> | undefined;

export function getServer() {
  server ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set on this deployment");
    const database = openDatabase(url ? { url } : { dataDir: ".pglite" });
    if (!url) await database.migrate();
    const deps: Deps = {
      db: database.db,
      now: () => new Date(),
      log: { error: (err) => console.error(err) },
      config: defaultConfig,
    };
    return { api: createApi(deps, handlers), deps, database };
  })();
  return server;
}
