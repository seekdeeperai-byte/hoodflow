# HOODFLOW — Security

Status as of this build (Phase 0–3). This is a living document — update it
every time a new attack surface (new provider, new route, LLM integration,
DB) is added.

## Threat model boundaries honored by design

- **No custody, no signing, no execution.** Nothing in this codebase holds a
  private key, constructs a transaction, or places an order. HOODFLOW only
  reads public on-chain/off-chain data and reasons about it. There is
  currently no wallet-connect flow of any kind.
- **No user accounts / auth yet.** The only route is a public read endpoint
  (`GET /v1/report/:chainId/:address`) and a health check. There is nothing
  to authenticate or authorize against yet — this changes once
  watchlists/alerts (Phase 10+) are built, at which point this doc needs an
  authn/authz section before that ships.

## SSRF

The only user-controlled inputs are `chainId` and `address`. Neither is
ever used to construct an arbitrary outbound URL:

- `chainId` must resolve to an entry in the hardcoded `CHAINS` registry
  (`packages/providers/src/chains.ts`) or the request is rejected with 404
  before any provider is called.
- `address` is validated against `/^0x[0-9a-fA-F]{40}$/`
  (`packages/providers/src/validate.ts`) before being interpolated into any
  provider URL, and every provider URL is built from a hardcoded,
  provider-owned base URL plus that validated segment. There is no code
  path where a caller-supplied string becomes the host or scheme of an
  outbound request.

## Input validation

- Route params are parsed through a zod schema (`ParamsSchema` in
  `apps/api/src/routes/report.ts`) before use.
- Every provider response is parsed through a zod schema at the boundary
  (`packages/providers/src/*/schema.ts`); a response that doesn't match is
  treated as `ERROR`, never coerced or partially trusted.
- Env config is parsed through a zod schema at boot (`apps/api/src/config.ts`)
  and the process fails to start on invalid config rather than falling back
  to insecure defaults.

## Secrets handling

- API keys (`GOPLUS_API_KEY`, `BLOCKSCOUT_API_KEY`) are read only from env,
  never hardcoded, never logged. `config.ts` is never passed to a logger.
- `safeUrlForLog()` (`packages/providers/src/http.ts`) strips query strings
  before a URL is ever used in an error message or log line, so an API key
  passed as a query parameter (GoPlus) can't leak into logs even
  indirectly.
- The centralized Fastify error handler (`apps/api/src/app.ts`) logs only
  `err.message` server-side and returns a generic message to the client —
  no stack traces, no internal error detail cross the HTTP boundary.

## Rate limiting

`@fastify/rate-limit` is wired globally (`RATE_LIMIT_MAX` /
`RATE_LIMIT_WINDOW_MS` env vars, defaulting to 30 req/60s per client). This
is a first pass — it's process-local (not shared across horizontally scaled
instances), which is fine for a single-instance deploy and becomes a gap
the moment there's more than one API instance behind a load balancer; a
Redis-backed rate limit store is the natural upgrade and is noted in
docs/ROADMAP.md.

## Dependency audit

`pnpm audit` (run 2026-09-14): **zero vulnerabilities in the production
dependency tree** (fastify, @fastify/rate-limit, zod, and the
@hoodflow/* workspace packages). Six vulnerabilities remain, all inside
`vitest`/`vite`/`@vitest/mocker`/`esbuild` — dev-only test tooling that is
never bundled into the deployed API and never exposed on a network in this
project (we don't run `vitest --ui` or a vite dev server). One "critical"
vitest UI-server advisory was present at the default installed version and
has been fixed by pinning `vitest@^3.2.6`; the remaining six require a
vitest 4.x major bump that isn't compatible with the currently resolvable
vite version in this environment — tracked as a follow-up, not a blocker.

## Known gaps (honest list, not yet addressed)

- **No CORS policy configured.** Fine today (no browser frontend exists
  yet); must be set explicitly, not left to Fastify defaults, before a
  frontend origin is added.
- **No structured request-id propagation to provider calls** — Fastify
  assigns a `reqId` for its own logs, but it isn't threaded through into
  provider client calls for cross-service trace correlation. Small, but
  worth doing before this has real production traffic.
- **No per-provider circuit breaker.** A provider that's down gets
  `PROVIDER_UNAVAILABLE` per-request (via the timeout), but there's no
  backoff — a slow provider will eat the full timeout on every request
  until it recovers. Not urgent at MVP traffic levels; revisit once real
  QPS is known.
- **Docker / deployment hardening not yet done** — no Dockerfile, no
  non-root container user, no resource limits, no secrets manager
  integration. This is Phase 8/9 work and is intentionally not implemented
  before a deployment target is chosen with the product owner (see the
  milestone report's "needs product-owner input" section).
