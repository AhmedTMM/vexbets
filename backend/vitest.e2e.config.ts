import { defineConfig } from "vitest/config";

// Secrets for live tests live in backend/.env.local (gitignored). Missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    globalSetup: ["e2e/server.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
