import { defineConfig } from "vitest/config";

// Secrets for live tests live in backend/.env.local (gitignored). Missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
