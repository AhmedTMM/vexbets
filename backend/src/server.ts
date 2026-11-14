import { type Database, openDatabase } from "./db/client";
import { type Deps, defaultConfig } from "./deps";
import { handlers } from "./handlers";
import { type Api, createApi } from "./http";
import { keywordJudge } from "./judge/fake";
import { geminiJudge } from "./judge/gemini";
import type { Judge } from "./judge/types";
import { deepgramTokens } from "./stt/deepgram";

/**
 * The process-wide server used by the Next.js routes.
 * DATABASE_URL set: real Postgres (Neon on Vercel), migrated by `npm run db:migrate` at build.
 * Not set: PGlite on disk in backend/.pglite, migrated on start. Zero setup for local dev.
 */
let server: Promise<{ api: Api; deps: Deps; database: Database }> | undefined;

function pickJudge(): Judge {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (apiKey && model) return geminiJudge({ apiKey, model });
  if (apiKey || model) throw new Error("set both GEMINI_API_KEY and GEMINI_MODEL, or neither");
  console.warn("GEMINI_API_KEY not set: using the fake keyword judge");
  return keywordJudge;
}

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
      judge: pickJudge(),
      stt: process.env.DEEPGRAM_API_KEY ? deepgramTokens(process.env.DEEPGRAM_API_KEY) : undefined,
      config: defaultConfig,
    };
    return { api: createApi(deps, handlers), deps, database };
  })();
  return server;
}
