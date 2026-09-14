# HOODFLOW — Roadmap

Status snapshot: 2026-09-14. Phases below are working-order guesses at the
dependency graph, adjusted from the product spec's suggested order where
research showed a better sequence (e.g. social/news needs credential
decisions from the product owner, so it's sequenced after historical
intelligence rather than before, to avoid blocking on external input).

## Done (this build)

- [x] Phase 0 — Discovery + research (Robinhood Chain, Blockscout, GoPlus,
      DexScreener; sandbox egress constraint documented)
- [x] Phase 1 — Monorepo foundation (pnpm workspaces, TypeScript, vitest)
- [x] Phase 2 — Provider + normalization foundation (GoPlus, DexScreener,
      Blockscout clients; zod validation at every boundary; explicit
      DataState everywhere)
- [x] Phase 3 (partial) — Core intelligence: contract + liquidity analyzers,
      Signal/Relationship/Evidence/Interpretation engines, deterministic
      market-state selection, Fastify API vertical slice

## Next up (recommended order)

1. **Verify live provider behavior against real egress.** Everything above
   is tested against fixtures because this sandbox can't reach the open
   internet (docs/ARCHITECTURE.md §2). The single highest-value next step
   is running this code somewhere with real network access and diffing
   actual GoPlus/DexScreener/Blockscout responses against the zod schemas —
   especially confirming (a) whether GoPlus recognizes chain 4663 at all,
   and (b) DexScreener's Robinhood Chain slug, per docs/DATA_SOURCES.md.
   Everything downstream of "does chain 4663 have DexScreener liquidity
   data yet" is currently an informed guess.
2. **Holders analyzer + signals.** `HolderSummary` is already normalized
   (Blockscout client, Phase 2) but nothing in `analyzers/` consumes it yet
   — no `HOLDER_CONCENTRATION`/`HOLDER_GROWTH` signals are emitted even
   though the data is already flowing through the pipeline. This is small
   and high-value: wire it up before anything else.
3. **Phase 4 — Historical intelligence.** Add a `HistoryStore` interface
   (`record(snapshot)`, `since(token, window)`) with an in-memory
   implementation swapped for Postgres once a deployment target is chosen.
   This unlocks true growth-rate signals (`LIQUIDITY_GROWTH`,
   `HOLDER_GROWTH`, etc.) that the current single-snapshot ratios only
   approximate.
4. **Deployer/wallet intelligence.** Needs Blockscout's transaction/
   internal-tx endpoints (1,000-record pagination cap per their docs) —
   scope a first pass around "does this contract's creator have other
   deployments" before attempting full wallet-cluster analysis.
5. **Phase 5 — Social + news + hype.** Sequenced after historical
   intelligence because every social source realistically needs either a
   paid API tier or an account-owner decision (X API access tier, Reddit
   API app registration, a licensed news feed) — see "needs product-owner
   input" in the milestone report. The Hype Engine and social/on-chain
   relationship types are already typed in `packages/core/src/types/intelligence.ts`
   so this is additive, not a redesign.
6. **Phase 6/7 — Frontend ("What HOODFLOW Sees").** Not started. Needs a
   decision on framework (Next.js is the default per the spec) and,
   separately, a decision on where this deploys.
7. **Phase 8/9 — Hardening + deployment.** Dockerfile, CI, secrets
   management, and the deployment target itself are all blocked on a
   product-owner decision (see milestone report).

## Explicitly deferred (typed but not built)

- `ACCUMULATION`, `OVERHEATED`, `DISTRIBUTION` market states (need
  holder-trend + wallet-cluster signals)
- Share card (product spec §42) — natural fit once the frontend exists
- Watchlists/alerts/subscriptions (product spec §43) — explicitly flagged
  in the spec itself as "don't prematurely implement"
