import { type Database, openDatabase } from "./db/client";
import { type Deps, defaultConfig } from "./deps";
import { handlers } from "./handlers";
import { type Api, createApi } from "./http";
import { keywordJudge } from "./judge/fake";
import { geminiJudge } from "./judge/gemini";
import type { Judge } from "./judge/types";
import { deepgramTokens } from "./stt/deepgram";
import { fakeSttTokens } from "./stt/fake";
import type { SttTokens } from "./stt/types";

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

function pickStt(): SttTokens | undefined {
  const provider = process.env.STT_PROVIDER ?? (process.env.DEEPGRAM_API_KEY ? "deepgram" : "fake");
  if (provider === "fake") return fakeSttTokens;
  if (provider === "deepgram" && process.env.DEEPGRAM_API_KEY)
    return deepgramTokens(process.env.DEEPGRAM_API_KEY);
  throw new Error(`STT_PROVIDER=${provider} is not configured`);
}

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function getServer() {
  server ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set on this deployment");
    const database = openDatabase(url ? { url } : { dataDir: process.env.PGLITE_DIR ?? ".pglite" });
    if (!url) await database.migrate();
    const deps: Deps = {
      db: database.db,
      now: () => new Date(),
      log: { error: (err) => console.error(err) },
      judge: pickJudge(),
      stt: pickStt(),
      config: {
        ...defaultConfig,
        judgeEveryMs: intEnv("JUDGE_EVERY_MS", defaultConfig.judgeEveryMs),
        closeEveryMs: intEnv("CLOSE_EVERY_MS", defaultConfig.closeEveryMs),
      },
    };
    return { api: createApi(deps, handlers), deps, database };
  })();
  return server;
}
