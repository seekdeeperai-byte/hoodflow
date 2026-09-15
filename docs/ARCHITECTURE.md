# HOODFLOW — Architecture

Status: Phase 0–5. Last updated 2026-09-15.

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
  higher limits. GoPlus's supported-chain list is maintained independently
  of any one chain's launch; **whether chain 4663 is already onboarded is
  unverified as of this writing** — the provider is built to degrade to
  `PROVIDER_UNAVAILABLE` cleanly if the chain isn't recognized, rather than
  assuming support.
- **DexScreener's API** is pair/liquidity data keyed by `chainId` (a slug,
  not a numeric id, e.g. `ethereum`, `base`). It documents ~60+ chains but
  the docs excerpt available to us does not enumerate them, and this
  sandbox cannot make a live test call (see §2). **Robinhood Chain
  DexScreener support is unverified** and, given the chain is two months
  old, plausibly not yet indexed. This is treated as an expected
  `DATA_UNAVAILABLE` condition, not a bug — HOODFLOW is designed to say "no
  liquidity data available" rather than fabricate it.
- No existing HOODFLOW repository, database, or credentials exist in this
  environment. Node 22 / pnpm 10 / Python 3.11 / git / Docker are
  available; PostgreSQL and Redis binaries are installed but **not
  running** (no live server).

## 2. Environment constraint (important, non-negotiable)

This build environment's outbound network access is policy-restricted: the
sandbox's shell can reach package registries (npm, PyPI, etc.) directly,
but arbitrary third-party hosts (`api.gopluslabs.io`, `api.dexscreener.com`,
`*.blockscout.com`, chain RPC endpoints) return `403` at the egress proxy.
Only the `WebSearch`/`WebFetch` tools (used for the research above) can
reach the open web from here.

**Consequence:** provider integrations in this repo are built and tested
against **documented API contracts and realistic fixtures**, not live
traffic, because live traffic isn't reachable from this sandbox. This is
explicitly allowed by the project's own data-integrity rules (fixtures for
tests/dev only) but it also means: **live-provider correctness is
UNVERIFIED until this code runs somewhere with real egress** (a real
deploy target, or the user's own machine/network). Nothing in this codebase
silently substitutes fixture data for production traffic — the fixtures
live only in `*/test/fixtures` and are wired only into test files.

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

Wallet-cluster/deployer-history analyzers, the social/news/hype layers, and
full historical time-series intelligence (beyond the minimal `HistoryStore`
built in Phase 4 and reused as-is for identity in Phase 5) are architected
for (types exist in `core/types`) but not yet implemented — see
`docs/ROADMAP.md`.

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
