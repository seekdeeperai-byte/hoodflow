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

/**
 * Content-Security-Policy (SECURITY HARDENING, 2026-09-16).
 *
 * Tightened to what this app actually needs, verified against the real
 * production build with a headless browser (see the security/SEO pass in
 * docs/SECURITY.md), not copied from a template:
 *
 * - `default-src 'self'` — every resource this app loads is same-origin.
 *   There are no third-party scripts, no analytics, no ad tags, no external
 *   fonts (globals.css uses system font stacks deliberately) and no remote
 *   images anywhere in apps/web.
 * - `script-src 'self' 'unsafe-inline'` — Next.js App Router inlines its
 *   bootstrap/flight-data payload in `<script>` tags on every server-rendered
 *   response. Dropping `'unsafe-inline'` breaks hydration outright. The
 *   correct fix is nonce-based CSP via middleware, which forces every page
 *   to become dynamically rendered and would defeat the static prerendering
 *   this app relies on; that trade is not justified here, because this app
 *   renders no user-generated or provider-supplied HTML at all — every
 *   external string (token names, news headlines, social post text) is
 *   escaped JSX text. The single `dangerouslySetInnerHTML` in the codebase
 *   (app/layout.tsx) writes a static, build-time JSON-LD constant that
 *   interpolates no runtime data whatsoever, which is the approach Next.js
 *   documents for structured data. Documented explicitly rather than left as
 *   an unexplained gap.
 * - `style-src 'self' 'unsafe-inline'` — the UI uses React inline `style`
 *   props extensively (see any component in apps/web/components).
 * - `connect-src 'self'` — the browser only ever calls same-origin
 *   `/api/v1/*`, which this server rewrites to the API. The API's real
 *   address is never exposed to the client, so it never needs to be
 *   allowlisted here.
 * - `frame-ancestors 'none'` — modern, header-level clickjacking protection
 *   (X-Frame-Options below is kept for older browsers that ignore CSP).
 * - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` — remove
 *   plugin embedding, `<base>` hijacking, and off-site form posting.
 * - `upgrade-insecure-requests` — a no-op over plain HTTP locally; upgrades
 *   any accidental http:// subresource once deployed behind TLS.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,

  // Removes the default `X-Powered-By: Next.js` response header. Framework
  // and version disclosure buys an attacker free reconnaissance and buys this
  // product nothing.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Every route, including the metadata routes (robots.txt, sitemap.xml).
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          // Stops MIME-sniffing a response into something executable.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Belt-and-braces clickjacking protection for browsers that predate
          // CSP frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          // Send the origin (not the full path) cross-origin: a report URL
          // contains the token address someone scanned, which should not leak
          // to third parties through a Referer header.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // This app uses none of these device APIs; deny them outright so a
          // future dependency cannot quietly start using them either.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          // Isolates this origin from cross-origin window references.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // The API proxy path carries point-in-time intelligence that must never
        // be served from a shared cache under a fresher-looking timestamp — the
        // same `no-store` rule the API itself sets (apps/api/src/app.ts).
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },

  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_BASE_URL}/v1/:path*` },
      { source: "/api/healthz", destination: `${API_BASE_URL}/healthz` },
    ];
  },
};

export default nextConfig;
