# HOODFLOW — Data Sources

## Implemented in this build

Status tags (standardized as of Phase 10 — see docs/LIVE_VERIFICATION.md
for the full legend and evidence): `LIVE VERIFIED` (the repo's own client
executed successfully against the real provider), `LIVE UNVERIFIED` (API
contract believed correct from docs/partial evidence, but the repo's own
client has never executed against it), `SANDBOX BLOCKED` (this
environment's egress policy rejects the connection, not the provider),
`WAF BLOCKED` (the provider's own host rejects the request), `NOT
CONFIGURED` (credential not set — not a failure if the provider supports
unauthenticated access), `NOT IMPLEMENTED` (no client exists).

| Domain | Provider | Endpoint | Auth | Credential | Status |
|---|---|---|---|---|---|
| Contract security | GoPlus Security Token Security API v1 | `GET api.gopluslabs.io/api/v1/token_security/{chain_id}?contract_addresses=...` | Optional Bearer token (higher limits) | `GOPLUS_API_KEY`: NOT CONFIGURED (not required at low volume) | Implemented; chain-4663 support confirmed via a non-repo fetch path (Phase 4, re-confirmed Phase 9/10). Repo's own `GoPlusClient` code: **LIVE UNVERIFIED, SANDBOX BLOCKED** — re-tested Phase 10, still rejected at the egress policy's CONNECT layer. |
| Liquidity / market | DexScreener | `GET api.dexscreener.com/token-pairs/v1/{chainSlug}/{address}` | None documented | n/a | Implemented; Robinhood Chain slug confirmed as `"robinhood"` via a non-repo fetch path (Phase 4). Repo's own `DexScreenerClient` code: **LIVE UNVERIFIED, SANDBOX BLOCKED** — re-tested Phase 10, same result as GoPlus. |
| Holders | Blockscout REST API v2 (official Robinhood Chain explorer) | `GET {baseUrl}/api/v2/tokens/{address}` + `.../holders` | Optional Bearer token (5 rps free / 100k credits/day without) | `BLOCKSCOUT_API_KEY`: NOT CONFIGURED | Implemented; wire shape unverified against live traffic. Repo's own `BlockscoutClient` code: **SANDBOX BLOCKED** (this environment) **and separately WAF BLOCKED** (the explorer's own bot protection rejects even the non-repo fetch path that works for GoPlus/DexScreener) — see docs/LIVE_VERIFICATION.md. |
| RPC | none | — | — | — | **NOT IMPLEMENTED.** No RPC client exists anywhere in this repository. Explicitly out of scope to build in Phase 10 (and every phase before it); not a bug. |

## Not yet implemented (architected for, see docs/ROADMAP.md)

- Wallet/deployer intelligence (funding clusters, deployer history) —
  needs a transaction-graph data source; Blockscout's transaction/internal-tx
  endpoints are the likely starting point, capped at 1,000 records/query per
  their docs.
- Social (X, Reddit, Telegram) — needs credentials/API access decisions from
  the product owner (see the milestone report).
- News/RSS — candidate sources not yet evaluated; needs a licensing/ToS
  pass before implementation, per product spec §20.

## Robinhood Chain specifics

- Mainnet chain id **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`,
  explorer `https://robinhoodchain.blockscout.com`. Live since 2026-07-01.
- Testnet chain id **46630**, RPC `https://rpc.testnet.chain.robinhood.com`,
  explorer `https://explorer.testnet.chain.robinhood.com`. Live since
  2026-02-10.
- Blockscout is the **official** indexer (Blockscout has a published blog
  post specifically about powering Robinhood Chain), so it's treated as the
  ground-truth source for holder counts and contract metadata on this
  chain, ahead of Etherscan-style alternatives.
- **GoPlus chain-4663 support is confirmed.** A Phase 4 live call (via a
  policy-trusted fetch path available to that build session, distinct from
  this sandbox's blocked general network — see docs/ARCHITECTURE.md §2)
  returned a real, populated result for chain 4663, and GoPlus's own
  supported-chain listing explicitly lists "Robinhood (4663)." Phase 9
  re-ran the same live check and got fresh, current data (holder_count had
  grown since Phase 4). Full detail: docs/LIVE_VERIFICATION.md. What
  remains unverified is `packages/providers`' own `GoPlusClient` code
  executing against live traffic — that still hasn't happened from inside
  this sandbox in any phase; `scripts/verify-live-providers.ts` is built to
  close that gap from an environment with real network egress.
- **DexScreener's chain slug for Robinhood Chain is confirmed: `"robinhood"`**
  (a Phase 0 guess of `"robinhoodchain"` was checked in Phase 4 and found
  wrong — an empty response for the wrong slug is indistinguishable from
  "no pairs" by design, which is exactly why this needed a positive-control
  live check rather than an empty-response check). `packages/providers/src/chains.ts`
  now sets `dexScreenerSlug: "robinhood"` and `dexScreenerSlugVerified: true`
  for chain 4663. The testnet (46630) slug remains unverified and stays
  `undefined`; the API pipeline (`apps/api/src/pipeline.ts`) skips the
  DexScreener call entirely whenever `dexScreenerSlugVerified` is not
  `true` for the requested chain, returning `DATA_UNAVAILABLE` with an
  explanatory message rather than guessing. As with GoPlus,
  `DexScreenerClient`'s own code executing against live traffic remains
  unverified from this sandbox — see docs/LIVE_VERIFICATION.md.

## Rate limits (as documented, unverified against live traffic from this build)

- GoPlus: no key needed at low volume; a Bearer token raises the ceiling.
  Exact free-tier numbers weren't in the reachable docs — verify before
  relying on it at any real request volume.
- DexScreener: docs state 60 req/min on several endpoints.
- Blockscout: 5 req/s / 100k credits/day free tier with a key from
  dev.blockscout.com; unauthenticated calls are heavily throttled. **A free
  Blockscout API key should be obtained before this goes beyond
  light manual testing** — self-service, no cost, but it's a real-world
  account action the product owner should take (or explicitly delegate),
  not something invented here.
