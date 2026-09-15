# HOODFLOW — Security

Status as of this build (Phase 0–6). This is a living document — update it
every time a new attack surface (new provider, new route, LLM integration,
DB) is added.

## Phase 6 recheck (2026-09-15)

Re-audited specifically against what changed this phase: the new
`packages/core/src/historical/` modules (`delta-engine.ts`,
`trend-engine.ts`, `temporal-relationship-engine.ts`,
`historical-signals.ts`, `build-history.ts`), the new `history` field on
`HoodflowReport`, and the `BuildReportOptions.previousSnapshot` wiring in
`report/build-report.ts` and `apps/api/src/routes/report.ts`. Full detail
in docs/HISTORICAL_INTELLIGENCE.md's own "Security review" section —
summarized here:

- **No new I/O surface.** Every new module is pure computation over
  already-fetched, already-validated `TokenSnapshot` data (current +, at
  most, one previous snapshot from the unchanged `HistoryStore`) — none
  construct a URL, open a socket, or touch the filesystem.
- **NaN/Infinity/negative values handled explicitly, not by luck.**
  `delta-engine.ts::usableValue()` requires `Number.isFinite`; a negative
  value on either side of a comparison (physically impossible for
  liquidity/holder-count/concentration) produces `NOT_COMPARABLE` rather
  than a misleading delta. Division by zero (`previousValue === 0` for an
  amount metric) is handled explicitly with `percentChange: null`, never
  `Infinity`/`NaN`. Both are regression-tested
  (`packages/core/test/delta-engine.test.ts`).
- **No new unbounded-memory surface.** The new `historical/*` modules hold
  no state between calls — every function is stateless. `HistoryStore`'s
  existing, already-documented cap (`MAX_SCANS_PER_TOKEN = 1000`; no cap
  on distinct-token count, a known Phase 4 gap) is unchanged — Phase 6
  adds no new store, cache, or `Map`.
  Duplicate-timestamp and future-timestamp scans were checked explicitly
  (`packages/core/test/build-history.test.ts`) — neither crashes or
  produces `NaN`/`Infinity`; `HistoryStore` itself still doesn't validate
  timestamp ordering (Phase 4 behavior, unchanged — out of scope for Phase
  6, since nothing in the new engines assumes strictly-increasing
  timestamps beyond what `getPreviousSnapshot`'s own logic already
  guarantees).
- **No O(n²) or unbounded-complexity path.** `computeComparisons` iterates
  a fixed 4-metric list; `computeTrends`/`detectTemporalRelationships` are
  linear in that same small, bounded input — nothing scales with total
  history depth. The route's `HistoryStore.getPreviousSnapshot` call is
  O(scans-for-this-token), already bounded by the Phase 4 per-token cap,
  never `O(all historical observations)`.
- **No new log/secret-leakage path.** None of the new modules log
  anything; the route's existing log line (`{chainId, addressPrefix}`) is
  unchanged. Evidence/interpretation strings are built from
  already-validated numeric fields via template literals — the same
  pattern used everywhere else since Phase 0.
- **Score integrity double-checked by test, not just asserted** — same
  discipline as the Phase 5 near-miss below. `marketLimitationsCount` is
  captured before any identity *or* historical limitation is pushed;
  historical signals are appended to `signals` only after
  `detectRelationships`/`buildEvidence`/`selectMarketState` have already
  run. `build-report.test.ts`'s "Score integrity" describe block asserts
  by test that an otherwise-identical report with and without a
  `previousSnapshot` produces identical `marketState.state` and
  `score.dataQualityScore`.
- **Dependency audit re-run:** unchanged — zero vulnerabilities in
  production dependencies, same 6 dev-only advisories
  (`vitest`/`vite`/`@vitest/mocker`) as every prior phase. No new
  dependencies were added this phase.

## Phase 5 recheck (2026-09-15)

Re-audited specifically against what changed this phase: `resolveIdentity`/
`analyzeIdentity` (packages/core/src/identity/, .../analyzers/
identity-analyzer.ts), the `observedName`/`observedSymbol` fields added to
three provider domain types, and the `KnownToken` move into
`@hoodflow/core`. Full detail in docs/IDENTITY_RESOLUTION.md's own
"Security review" section — summarized here:

- **No new SSRF/URL surface.** Identity resolution is pure computation
  over already-fetched, already-validated data — it never constructs a URL
  or makes a network call. Confirmed by reading `resolve-identity.ts` top
  to bottom: the only external input touched is `address` (re-validated
  against a local copy of the existing EVM-address regex) and the
  already-fetched `knownTokens`/`providerObserved` arrays.
- **No new input-validation gap.** `chainId`/`address` still go through
  the same zod `ParamsSchema` + `isValidEvmAddress()` gate in
  `apps/api/src/routes/report.ts` as before — nothing about Phase 5 adds a
  second, weaker validation path. (`resolveIdentity`'s own defensive regex
  check is redundant-by-design for production traffic, since the route
  already rejects malformed addresses first — it only matters for direct/
  unit callers, and is covered by a test.)
- **Registry data-entry bug class, not a live vulnerability, now has a
  regression test.** `CHAINS` is a compile-time TypeScript literal with no
  runtime write path, so "malicious registry ingestion" isn't reachable —
  but a real *authoring* mistake (two entries sharing an address, or a
  synthetic `test_fixture` entry accidentally landing in a real chain's
  registry) would be a genuine correctness bug. Added:
  `packages/providers/test/chains.test.ts` now asserts no chain's real
  registry has a duplicate address and that no entry uses the
  `test_fixture` source (reserved for `packages/core/test/*` fixtures).
- **No new DoS/enumeration surface.** `resolveIdentity` is
  O(knownTokens.length); the registry holds 0–3 entries per chain today.
  The existing per-IP rate limiter (`@fastify/rate-limit`, unchanged)
  still bounds request volume; nothing about identity resolution changes
  that surface's shape.
- **No new secret/log-leakage path.** The route's log line is unchanged
  (`{chainId, addressPrefix}` only); provider-observed name/symbol strings
  flow into the JSON response and into `pino`'s structured logger as
  ordinary field values, never via string interpolation into a log
  message or URL — the same pattern already used for `evidence` strings
  since Phase 0.
- **Score integrity double-checked, not just asserted.** A near-miss was
  caught and fixed during this phase's own implementation (not by a
  reviewer after the fact): an early version of the `build-report.ts`
  change let identity limitations leak into
  `dataQuality.overallConfidencePenalty`'s calculation, which would have
  been a real, unintended score-adjacent behavior change. Fixed by
  capturing `marketLimitationsCount` before any identity limitation is
  considered — see docs/IDENTITY_RESOLUTION.md "Score integrity" for the
  full account. `score.dataQualityScore` and `marketState` were verified
  (by test, not just by reading the code) to be identical whether or not
  identity signals are present — see
  `packages/core/test/build-report.test.ts`'s assertion that
  `overallConfidencePenalty` for an all-unavailable snapshot is
  unaffected by the (now-always-present) `IDENTITY_UNVERIFIED` signal.
- **Dependency audit re-run:** unchanged from Phase 0–4 — zero
  vulnerabilities in production dependencies, same 6 dev-only advisories.
  No new dependencies were added this phase.

## Phase 4 recheck (2026-09-14)

Re-audited specifically against what changed this phase: the expanded
chain registry, the holders analyzer, the HistoryStore, and
`scripts/verify-live-providers.ts`.

- **SSRF — still closed the same way.** The chain registry
  (`packages/providers/src/chains.ts`) is a hardcoded map; a request's
  `chainId` either matches an entry or the route 404s before any provider
  is called. Nothing about the registry expansion (native currency, known
  tokens, verification flags) introduces a new way for request input to
  reach a URL.
- **New finding, fixed:** a real (blocked) live-provider run surfaced that
  GoPlus and DexScreener's HTTP 403 responses fell through to the generic
  `ERROR` state while Blockscout's didn't — meaning two of three providers
  couldn't distinguish "the request was blocked before reaching you" from
  "you rejected this specific request." All three now classify 403 as
  `PROVIDER_UNAVAILABLE` consistently. See docs/LIVE_VERIFICATION.md and
  the regression tests added for this (`packages/providers/test/*.test.ts`,
  the "returns PROVIDER_UNAVAILABLE ... on HTTP 403" cases).
- **New finding, partially mitigated:** `InMemoryHistoryStore` is an
  unbounded-by-token-count in-memory `Map` — a per-token cap
  (`MAX_SCANS_PER_TOKEN = 1000`, oldest dropped first) was added to bound
  memory growth for repeated scans of the *same* token, but there is no
  cap on the number of *distinct* tokens tracked. An attacker who requests
  reports for many different addresses can still grow this store without
  bound, limited only by the global rate limiter (which is per-IP and
  process-local — see the existing rate-limiting gap below). This is
  acceptable for local dev and for proving the historical mechanism works,
  **not** acceptable as the production history store — the real fix is
  the Postgres-backed implementation with an actual retention policy
  (docs/HISTORY_SCHEMA.md), not a bigger in-memory cap.
- **`scripts/verify-live-providers.ts`** reads `GOPLUS_API_KEY`/
  `BLOCKSCOUT_API_KEY` from env and passes them only as request headers to
  the real client classes — it never prints them, and every printed
  "REQUEST" line was checked to confirm neither provider's key goes in a
  query string for either of these two providers (Blockscout does support
  a query-string key form in some configurations; this script and the
  underlying `BlockscoutClient` never use it, only the `Authorization`
  header).
- **Dependency audit re-run:** same result as Phase 0–3 — zero
  vulnerabilities in production dependencies (`fastify`,
  `@fastify/rate-limit`, `zod`, `@hoodflow/*`); the 6 pre-existing
  advisories are still confined to dev-only test tooling
  (`vitest`/`vite`/`@vitest/mocker`) and unchanged by this phase's work.

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

`pnpm audit --prod` (last run 2026-09-15, Phase 11): **zero known
vulnerabilities**, across both production dependency trees —
`apps/api` (fastify, @fastify/rate-limit, zod, and the @hoodflow/*
workspace packages) and `apps/web` (next, react, react-dom). This was not
always true: this same command found 2 HIGH + 2 moderate advisories on
`postcss` (transitively via `apps/web`'s `next` dependency) as of Phase 11,
fixed via a `pnpm.overrides` pin — see the Phase 11 recheck above. The
2026-09-14 note this replaced only checked `apps/api`'s tree, before
`apps/web` (added in Phase 8) was part of the production dependency graph
this audit needs to cover — corrected here, not just appended, since the
old note's "zero vulnerabilities in the production dependency tree" claim
was materially incomplete once `apps/web` existed.

Dev-only tooling (`vitest`/`vite`/`@vitest/mocker`/`esbuild`) has its own,
separate advisory history, not re-audited in Phase 11 since it's never
bundled into either deployed app or exposed on a network in this project.

## Phase 11 recheck (2026-09-15) — deployment readiness + security audit

Re-audited as part of a durable-remote/deployment-readiness phase, not a
feature phase. Two real findings, both fixed (see docs/LIVE_VERIFICATION.md's
Phase 11 section for the full evidence trail):

- **`pnpm audit --prod` found 2 HIGH + 2 moderate advisories** on
  `postcss@8.4.31`, pulled in transitively through `apps/web`'s
  `next@15.5.25` (a real production dependency, not dev-only) —
  arbitrary file/sourcemap disclosure via CSS `sourceMappingURL` handling
  (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-qx2v-qp2m-jg93,
  GHSA-fxqj-rqcc-2cmp). Fixed with a `pnpm.overrides` pin to
  `postcss@^8.5.28` in the root `package.json` (the version already
  resolved elsewhere in the tree via `vite`, so this isn't introducing an
  unvetted new version). Re-verified: `pnpm audit --prod` now reports zero
  known vulnerabilities; build output (bundle sizes, routes) identical
  before/after; full test suite re-ran clean.
- **A cross-chain data-integrity bug, found during the deployment
  readiness audit rather than a security scan**, but reported here because
  it's exactly the class of bug this document exists to catch:
  `apps/api/src/pipeline.ts` called the single, chain-4663-scoped
  `BlockscoutClient` unconditionally for any registered chain (including
  testnet 46630), so a request for a different registered chain could have
  returned real mainnet holder data misattributed to that chain's report.
  Not an injection/auth vulnerability, but a genuine violation of this
  project's core data-integrity guarantee (never present data from the
  wrong source as if it answers the question asked). Fixed by gating the
  Blockscout call behind an explicit `blockscoutChainId` on `PipelineDeps`,
  mirroring the existing DexScreener slug-verification gate. Full detail:
  docs/DATA_CONTRACT_AUDIT.md's Phase 11 addendum.
- **Full security-relevant checklist re-run, all clean:** no hardcoded API
  keys/bearer tokens/private keys in tracked source (`git grep` for
  secret-shaped assignments, zero matches); no `.env` files tracked by git
  or present on disk; no secret values logged (confirmed against
  `apps/api/src/app.ts`'s centralized error handler, unchanged); no
  `NEXT_PUBLIC_`-prefixed env vars anywhere in `apps/web`, and
  `HOODFLOW_API_BASE_URL` is read only inside `next.config.mjs`
  (server-side only — never reaches the browser bundle); no CORS
  configured on the API and none needed, by design (see the corrected
  note below); input validation confirmed unchanged (`chainId`/`address`
  zod-parsed and EVM-address-validated before any URL is constructed,
  closing the SSRF surface per `packages/providers/src/http.ts`'s own
  documented note); no mock/fixture code reachable from `apps/api/src/server.ts`'s
  production wiring (mocks exist only in `*/test/*.ts`).

## Known gaps (honest list, not yet addressed)

- **No CORS policy configured — and, as of Phase 8, this is by design,
  not a gap.** *(Corrected in Phase 11: this note was written before
  Phase 8's frontend existed and was never updated. `apps/web` never makes
  a cross-origin request to `apps/api` — the browser talks to the Next.js
  server on a same-origin relative path, which forwards the request
  server-to-server via `next.config.mjs`'s `rewrites()`. See
  docs/FRONTEND.md's "Data flow: API -> UI." This remains worth
  revisiting only if a second, independently-hosted frontend origin is
  ever added.)*
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
