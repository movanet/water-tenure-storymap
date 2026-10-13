import type { NextConfig } from "next";

/**
 * API_INTERNAL_URL (read at build time): when set, requests to /api/* that
 * reach the web server are proxied to the tenure engine API at that origin,
 * for example http://api:8000 inside docker compose or
 * http://127.0.0.1:8000 for local development. Behind a reverse proxy that
 * already routes /api/* to the API (see deploy/Caddyfile.example) it is not
 * needed, but it does no harm.
 */
const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (!apiInternalUrl) return [];
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
};

export default nextConfig;
