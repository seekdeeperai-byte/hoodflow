# HOODFLOW — Architecture

Status: Phase 0–9. Last updated 2026-09-15 (Phase 9).

## 1. Discovery findings (Phase 0)

Verified via live web research on 2026-09-14 (sources at bottom):

- **Robinhood Chain is real and live.** It is an Arbitrum Orbit L2. Mainnet
  launched **July 1, 2026** (chain ID **4663**); a public testnet has been
  live since **February 10, 2026** (chain ID **46630**). Native currency is
  ETH — there is no native "Robinhood Chain token," and Robinhood's own docs
  warn that anything claiming to be one is fake.
  - Mainnet RPC: `https://rpc.mainnet.chain.robinhood.com`
  - Testnet RPC: `https://rpc.testnet.chain.robinhood.com`
  - Mainnet explorer: `https://robinhoodchain.blockscout.com`
  - Testnet explorer: `https://explorer.testnet.chain.robinhood.com`
- **Blockscout is the official explorer/indexer** for Robinhood Chain (there
  is a dedicated Blockscout blog post: "Build on Robinhood Chain with the
  Blockscout Pro API"). It exposes a REST API (`/api/v2/*`), an
  Etherscan-compatible JSON-RPC v2, and native JSON-RPC. Free tier: 5 req/s,
  100k credits/day, via a free key from dev.blockscout.com. Because this is
  the *official* indexer for the chain, it is HOODFLOW's primary source for
  contract metadata, verification status, holders, and transactions on
  Robinhood Chain.
- **GoPlus Security's Token Security API** is a per-chain-id REST endpoint
  (`GET /api/v1/token_security/{chain_id}?contract_addresses=...`), works
  without a key at low volume and accepts an optional Bearer token for
  higher limits. **Chain 4663 support is confirmed** — Phase 4 obtained a
  real live response for chain 4663 (USDG) via a policy-trusted fetch path
  distinct from this sandbox's blocked general network, and GoPlus's own
  supported-chain listing explicitly includes "Robinhood (4663)"; Phase 9
  re-ran the same check and got a fresh, current response (holder_count
  had grown since Phase 4, confirming this wasn't a cached/stale result).
  See docs/LIVE_VERIFICATION.md. The provider still degrades to
  `PROVIDER_UNAVAILABLE`/`DATA_UNAVAILABLE` cleanly if a future chain isn't
  recognized.
- **DexScreener's API** is pair/liquidity data keyed by `chainId` (a slug,
  not a numeric id, e.g. `ethereum`, `base`). **Robinhood Chain support is
  confirmed, and the slug is `"robinhood"`** (a Phase 0 guess of
  `"robinhoodchain"` was checked in Phase 4 and found wrong — an empty
  result for the wrong slug is indistinguishable from "no pairs" by
  design, which is exactly why this needed a positive-control live check).
  `packages/providers/src/chains.ts` sets `dexScreenerSlugVerified: true`
  for chain 4663 accordingly. See docs/LIVE_VERIFICATION.md.
- No existing HOODFLOW repository, database, or credentials exist in this
  environment. Node 22 / pnpm 10 / Python 3.11 / git / Docker are
  available; PostgreSQL and Redis binaries are installed but **not
  running** (no live server).

## 2. Environment constraint (important, non-negotiable)

This build environment's outbound network access is policy-restricted: the
sandbox's shell can reach package registries (npm, PyPI, etc.) directly,
but arbitrary third-party hosts (`api.gopluslabs.io`, `api.dexscreener.com`,
`*.blockscout.com`, chain RPC endpoints) return `403` at the egress proxy.
This is the network path `packages/providers`' own HTTP client (Node
`fetch`, via `packages/providers/src/http.ts`) actually uses — so the
repo's real provider client code has never executed a successful call
against a live provider from inside this sandbox, in any phase through
Phase 9.

**A separate, policy-trusted fetch path exists and matters here.** The
`WebFetch` tool (used for the research in §1, and again in Phase 4/Phase 9)
is a first-party fetcher, distinct from the sandbox's general-purpose
network access, that *can* reach some of these hosts — confirmed for
`api.gopluslabs.io` and `api.dexscreener.com` (Phase 4, re-confirmed with
fresh live data in Phase 9), but not `*.blockscout.com` (blocked by that
host's own WAF/bot-protection, a different 403 than the egress block, per
docs/LIVE_VERIFICATION.md). This let Phase 4/9 confirm real API *shape and
current behavior* for two of the three providers, but it does **not** run
`packages/providers`' own client code — a genuinely different transport,
and using it to make the repo's own clients "work" from here would mean
inventing a new transport mechanism outside the repo's documented
architecture, which HOODFLOW's phase rules explicitly disallow. See
docs/LIVE_VERIFICATION.md for the full distinction and evidence.

**Consequence:** provider integrations in this repo are built and tested
against **documented/live-confirmed API contracts and realistic
fixtures**, not live traffic through the repo's own client code, because
that traffic isn't reachable from this sandbox. This is explicitly allowed
by the project's own data-integrity rules (fixtures for tests/dev only)
but it also means: **whether `packages/providers`' own HTTP client code
executes correctly end-to-end against a live provider is UNVERIFIED until
this code runs somewhere with real egress** (a real deploy target, or the
user's own machine/network) — `scripts/verify-live-providers.ts` is built
to close exactly this gap the moment that's possible. Nothing in this
codebase silently substitutes fixture data for production traffic — the
fixtures live only in `*/test/fixtures` and are wired only into test
files.

## 3. Why this stack

- **TypeScript throughout, pnpm workspaces monorepo.** One language across
  API, background jobs, and shared intelligence logic; pnpm workspaces are
  the lowest-friction way to share the `core` package between the API and
  (later) a worker/frontend without publishing it.
- **Fastify for the API.** Schema-first request/response validation
  (via zod + fastify-type-provider-zod) matters more here than
  batteries-included features — HOODFLOW's whole premise is "never let bad
  data past the boundary," and that starts at the HTTP layer.
- **zod for all boundary validation** — provider responses, route params,
  and env config are all parsed through zod schemas that fail closed
  (`DATA_UNAVAILABLE`/`ERROR`), never silently coerced.
- **No LLM dependency for the MVP.** The Interpretation Engine is
  template-based and fully deterministic (§9 of the product spec requires
  scores/confidence/state to never come from an LLM anyway). An
  `LLMRewriter` interface exists so a language-polish pass can be added
  later without touching scoring logic, with the deterministic templates as
  the mandatory fallback.
- **In-memory `HistoryStore` behind a repository interface for this slice.**
  Postgres/Redis are the real target (already available as binaries in this
  image) but standing up migrations, pooling, and a queue is premature
  before the analyzer/signal/relationship/evidence pipeline is proven. The
  interface (`HistoryStore.record`, `.since`) is written so swapping in a
  Postgres-backed implementation later is a single-file change — this is
  Phase 4, tracked in the roadmap, not skipped.
- **No Docker Compose / deployment config yet.** Premature before there's
  a deployment target decision (see the report's "needs product-owner
  input" section).

## 4. Layered pipeline (implemented so far)

```
Provider (Blockscout | GoPlus | DexScreener)
   -> raw fetch + zod validation           [providers/*]
   -> ProviderResult<T> with DataState     [core/data-state]
Normalization                              [core/normalize]
Identity (Phase 5)                         [core/identity, core/analyzers/identity-analyzer]
Core Analyzers (contract, liquidity, holders) [core/analyzers]
Signal Engine                              [core/signals]
Relationship Engine                        [core/relationships]
Evidence Engine                            [core/evidence]
Interpretation Engine (template-based)     [core/interpretation]
Historical Intelligence (Phase 6)          [core/historical]  (reads HistoryStore, Phase 4)
HOODFLOW Report                            [core/report]
   -> Fastify route GET /v1/report/:chainId/:address
```

Identity resolution (Phase 5, docs/IDENTITY_RESOLUTION.md) sits between
Normalization and the Signal Engine: it decides what exact asset is being
analyzed (chain + contract address, authoritative) before name/symbol
context from any provider is interpreted. Its signals are appended to the
report's `signals` array but deliberately excluded from the Relationship/
Evidence Engine's market-signal contradiction sweep and from
`marketState`/`score.dataQualityScore` — identity risk is informational and
conceptually separate from contract/market risk.

Historical intelligence (Phase 6, docs/HISTORICAL_INTELLIGENCE.md) sits
alongside identity, after the market pipeline: it compares the current
snapshot against the single most recent prior scan of the same token (via
the unchanged, Phase-4 `HistoryStore`) to produce deltas, trends, and a
small set of cross-metric temporal relationships, exposed as
`HoodflowReport.history`. Its own signals (`source: "historical"`) follow
the exact same placement/exclusion as identity signals — informational,
never an input to `marketState`/`score.dataQualityScore`. It has its own,
separate, small Temporal Relationship Engine
(`core/historical/temporal-relationship-engine.ts`) rather than extending
`core/relationships/relationship-engine.ts`, because it combines
cross-snapshot Trends, not same-snapshot Signals — a structurally
different input.

Wallet-cluster/deployer-history analyzers and the social/news/hype layers
are architected for (types exist in `core/types`) but not yet
implemented — see `docs/ROADMAP.md`. A Postgres-backed `HistoryStore`
(replacing the Phase 4 in-memory implementation, still used as-is by
Phase 6) is also not yet built.

## 5. Data integrity rules enforced in code

- Every provider call returns `ProviderResult<T>` = `{ state, data?, error?,
  fetchedAt }` where `state` is one of `AVAILABLE | PARTIAL |
  DATA_UNAVAILABLE | PROVIDER_UNAVAILABLE | INVALID_INPUT | RATE_LIMITED |
  ERROR`. Nothing downstream is allowed to treat a missing/error state as
  zero, false, or "safe."
- Analyzers, the Signal Engine, and the Relationship Engine only run on
  `AVAILABLE`/`PARTIAL` data; a `DATA_UNAVAILABLE` domain contributes
  explicit `limitations[]` entries and lowers confidence rather than being
  papered over.
- The Interpretation Engine cannot produce a market state when the
  contributing signal set is empty — it returns `INSUFFICIENT_DATA`
  instead of guessing.

## Sources consulted

- https://robinhood.com/us/en/newsroom/robinhood-chain-launches-public-testnet
- https://trustswap.com/robinhood/network-details
- https://docs.blockscout.com/robinhood-api
- https://www.blog.blockscout.com/build-on-robinhood-chain-with-the-blockscout-pro-api/
- https://robinhoodchain.blockscout.com/api-docs
- https://docs.gopluslabs.io/reference/api-overview
- https://docs.gopluslabs.io/reference/tokensecurityusingget_1
- https://docs.dexscreener.com/api/reference
