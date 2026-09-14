# HOODFLOW — Data Sources

## Implemented in this build

| Domain | Provider | Endpoint | Auth | Status |
|---|---|---|---|---|
| Contract security | GoPlus Security Token Security API v1 | `GET api.gopluslabs.io/api/v1/token_security/{chain_id}?contract_addresses=...` | Optional Bearer token (higher limits) | Implemented, chain-4663 support unverified (see below) |
| Liquidity / market | DexScreener | `GET api.dexscreener.com/token-pairs/v1/{chainSlug}/{address}` | None documented | Implemented, Robinhood Chain slug unverified (see below) |
| Holders | Blockscout REST API v2 (official Robinhood Chain explorer) | `GET {baseUrl}/api/v2/tokens/{address}` + `.../holders` | Optional Bearer token (5 rps free / 100k credits/day without) | Implemented |

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
- **GoPlus chain-4663 support is unverified.** GoPlus's supported-chain list
  wasn't enumerable from the documentation pages reachable during Phase 0
  research, and this sandbox cannot make a live test call (see
  docs/ARCHITECTURE.md §2). The client is written to degrade to
  `DATA_UNAVAILABLE` cleanly (`result: {}` from GoPlus) rather than assume
  support — this needs to be checked against a live call the first time
  this code runs somewhere with real network egress.
- **DexScreener's chain slug for Robinhood Chain is unverified** for the
  same reason. `packages/providers/src/chains.ts` leaves
  `dexScreenerSlug: undefined` for both Robinhood Chain entries on purpose;
  the API pipeline (`apps/api/src/pipeline.ts`) checks this and skips the
  DexScreener call entirely when the slug is unset, returning
  `DATA_UNAVAILABLE` with an explanatory message rather than guessing a
  slug and silently getting empty/wrong results. **Action for whoever runs
  this next**: confirm DexScreener's Robinhood Chain slug (check
  https://dexscreener.com for a Robinhood Chain filter, or query
  `/token-pairs/v1/{guess}/...` for a known Robinhood Chain pair) and set
  it in `chains.ts`, flipping `dexScreenerSlugVerified: true`.

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
