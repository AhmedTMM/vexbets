import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@vexbets/contract"],
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default config;
