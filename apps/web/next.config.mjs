/** @type {import('next').NextConfig} */
// The existing @hoodflow/api Fastify server (apps/api) is left completely
// untouched by this frontend. Rather than add CORS to the backend (a new
// dependency + a new attack-surface decision that belongs to the API, not
// the frontend), the browser talks to this Next.js server on a *relative*
// path (/api/v1/...), and this server-side rewrite forwards that request to
// the real API. The actual cross-service HTTP call happens server-to-server
// (Node fetch), never in the browser, so there is no CORS concern at all and
// no API base URL — real or otherwise — is ever exposed to client code.
const API_BASE_URL = process.env.HOODFLOW_API_BASE_URL ?? "http://localhost:8787";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_BASE_URL}/v1/:path*` },
      { source: "/api/healthz", destination: `${API_BASE_URL}/healthz` },
    ];
  },
};

export default nextConfig;
