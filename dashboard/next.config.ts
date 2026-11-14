import type { NextConfig } from "next";

/**
 * NEXT_PUBLIC_API_MODE=mock (default): a stand-in backend runs in the browser.
 * NEXT_PUBLIC_API_MODE=live: calls go to /api/v1/* on this site and are forwarded to
 * BACKEND_URL (e.g. http://localhost:3001 or the backend's Vercel URL), so there is no CORS.
 */
const backend = process.env.BACKEND_URL?.replace(/\/$/, "");

const config: NextConfig = {
  transpilePackages: ["@vexbets/contract"],
  async rewrites() {
    return backend ? [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }] : [];
  },
};

export default config;
