import { after } from "next/server";
import { type Database, openDatabase } from "./db/client";
import { type Deps, defaultConfig } from "./deps";
import { handlers } from "./handlers";
import { type Api, createApi } from "./http";
import { keywordJudge } from "./judge/fake";
import { openaiJudge, type ReasoningEffort } from "./judge/openai";
import type { Judge } from "./judge/types";
import { deepgramTokens } from "./stt/deepgram";
import { fakeSttTokens } from "./stt/fake";
import { openaiSttTokens } from "./stt/openai";
import type { SttTokens } from "./stt/types";

/**
 * The process-wide server used by the Next.js routes.
 * DATABASE_URL set: real Postgres (Neon on Vercel), migrated by `npm run db:migrate` at build.
 * Not set: PGlite on disk in backend/.pglite, migrated on start. Zero setup for local dev.
 */
let server: Promise<{ api: Api; deps: Deps; database: Database }> | undefined;

/**
 * JUDGE=openai (default when OPENAI_API_KEY is set) or JUDGE=fake (keyword judge, free).
 * OPENAI_JUDGE_MODEL defaults to gpt-6.1-terra; OPENAI_REASONING_EFFORT defaults to none (fastest).
 */
function pickJudge(): Judge {
  const apiKey = process.env.OPENAI_API_KEY;
  const kind = process.env.JUDGE ?? (apiKey ? "openai" : "fake");
  if (kind === "fake") {
    console.warn("using the fake keyword judge");
    return keywordJudge;
  }
  if (kind !== "openai" || !apiKey) throw new Error(`JUDGE=${kind} needs OPENAI_API_KEY`);
  return openaiJudge({
    apiKey,
    model: process.env.OPENAI_JUDGE_MODEL || undefined,
    effort: (process.env.OPENAI_REASONING_EFFORT as ReasoningEffort | undefined) || undefined,
  });
}

function pickStt(): SttTokens | undefined {
  const openaiKey = process.env.OPENAI_API_KEY;
  // Deepgram first when its key is set (nova-3 on the band's raw Opus, tuned on band
  // recordings), then OpenAI, then fake. STT_PROVIDER overrides.
  const provider =
    process.env.STT_PROVIDER ?? (process.env.DEEPGRAM_API_KEY ? "deepgram" : openaiKey ? "openai" : "fake");
  if (provider === "fake") return fakeSttTokens;
  if (provider === "openai" && openaiKey) {
    return openaiSttTokens({ apiKey: openaiKey, model: process.env.OPENAI_STT_MODEL || undefined });
  }
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
      afterResponse: (task) => after(() => task().catch((err) => console.error(err))),
      config: {
        ...defaultConfig,
        closeEveryMs: intEnv("CLOSE_EVERY_MS", defaultConfig.closeEveryMs),
      },
    };
    return { api: createApi(deps, handlers), deps, database };
  })();
  return server;
}
