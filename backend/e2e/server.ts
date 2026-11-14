import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

/**
 * Start the built backend (`next start`) on a fresh PGlite database with fake STT and fast
 * timers, or use E2E_BASE_URL to test a running deployment instead.
 */
declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    cronSecret: string;
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3101);
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "e2e-cron-secret";

async function waitForHealth(url: string, child?: ChildProcess) {
  for (let i = 0; i < 120; i++) {
    if (child?.exitCode != null) throw new Error(`backend exited with ${child.exitCode}`);
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`backend at ${url} never became healthy`);
}

export default async function setup(project: TestProject) {
  const external = process.env.E2E_BASE_URL;
  if (external) {
    await waitForHealth(external);
    project.provide("baseUrl", external.replace(/\/$/, ""));
    project.provide("cronSecret", CRON_SECRET);
    return;
  }

  const dataDir = mkdtempSync(path.join(tmpdir(), "vexbets-e2e-"));
  const child = spawn("npx", ["next", "start", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "",
      PGLITE_DIR: path.join(dataDir, "db"),
      STT_PROVIDER: "fake",
      JUDGE: process.env.E2E_REAL_JUDGE ? "openai" : "fake",
      CLOSE_EVERY_MS: "250",
      CRON_SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const url = `http://127.0.0.1:${PORT}`;
  try {
    await waitForHealth(url, child);
  } catch (err) {
    child.kill();
    console.error(logs.join(""));
    throw err;
  }
  project.provide("baseUrl", url);
  project.provide("cronSecret", CRON_SECRET);

  return async () => {
    child.kill();
    if (process.env.E2E_SHOW_LOGS) console.log(logs.join(""));
    rmSync(dataDir, { recursive: true, force: true });
  };
}
