import { createClient } from "@vexbets/contract";
import postgres from "postgres";
import { openDatabase } from "../src/db/client";
import { type Deps, defaultConfig } from "../src/deps";
import { handlers } from "../src/handlers";
import { createApi } from "../src/http";
import { keywordJudge } from "../src/judge/fake";
import type { SttTokens } from "../src/stt/types";

/**
 * A whole backend in one process, on a fresh database.
 * Default: in-memory PGlite. With TEST_DATABASE_URL (CI): a new database on that server.
 */
async function freshDatabase() {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) return openDatabase();
  const name = `vexbets_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  await sql.unsafe(`create database ${name}`);
  const url = new URL(admin);
  url.pathname = `/${name}`;
  const database = openDatabase({ url: url.toString() });
  return {
    ...database,
    async close() {
      await database.close();
      await sql.unsafe(`drop database ${name} with (force)`);
      await sql.end();
    },
  };
}

export const fakeStt: SttTokens = {
  provider: "fake",
  async mint() {
    return { token: "fake-stt-token", expiresAt: new Date(Date.now() + 300_000) };
  },
};

export async function startBackend(overrides: Partial<Omit<Deps, "db">> = {}) {
  const database = await freshDatabase();
  await database.migrate();

  let clock = new Date("2026-11-14T20:00:00.000Z");
  const deps: Deps = {
    db: database.db,
    now: () => clock,
    log: { error: (err) => console.error(err) },
    judge: keywordJudge,
    stt: fakeStt,
    config: defaultConfig,
    ...overrides,
  };
  const api = createApi(deps, handlers);

  return {
    deps,
    api,
    /** A contract client that is logged in as `email`. */
    as: (email: string) =>
      createClient({
        baseUrl: "http://backend.test",
        fetch: api.fetch,
        headers: () => ({ authorization: `Bearer ${email}` }),
      }),
    anonymous: () => createClient({ baseUrl: "http://backend.test", fetch: api.fetch }),
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    now: () => clock,
    close: () => database.close(),
  };
}

export type Backend = Awaited<ReturnType<typeof startBackend>>;
