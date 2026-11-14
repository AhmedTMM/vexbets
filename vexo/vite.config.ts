import { defineConfig } from "vitest/config";

/**
 * The listen page. /api is proxied to the backend so the page and the API share an origin
 * (no CORS): BACKEND_URL defaults to the local backend from `npm run dev -w backend`.
 */
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.BACKEND_URL ?? "http://localhost:3001", changeOrigin: true } },
  },
  test: { include: ["test/**/*.test.ts"] },
});
