# HOODFLOW — Roadmap

Status snapshot: 2026-09-15. Phases below are working-order guesses at the
dependency graph, adjusted from the product spec's suggested order where
research showed a better sequence, and — as of Phase 5 — adjusted again
based on the actual state of the codebase rather than followed mechanically
(the user's own explicit instruction each phase: decide the next
highest-value step from what's actually built, not from a fixed list). The
phase *numbers* below reflect what was actually built in each numbered
phase, which has diverged from this doc's original Phase 0-3 guesses —
this file is corrected in place rather than left stale, per the "living
document" convention used throughout docs/.

## Done (this build)

- [x] Phase 0 — Discovery + research (Robinhood Chain, Blockscout, GoPlus,
      DexScreener; sandbox egress constraint documented)
- [x] Phase 1 — Monorepo foundation (pnpm workspaces, TypeScript, vitest)
- [x] Phase 2 — Provider + normalization foundation (GoPlus, DexScreener,
      Blockscout clients; zod validation at every boundary; explicit
      DataState everywhere)
- [x] Phase 3 — Core intelligence: contract + liquidity analyzers,
      Signal/Relationship/Evidence/Interpretation engines, deterministic
      market-state selection, Fastify API vertical slice
- [x] Phase 4 — Real provider validation (GoPlus/DexScreener confirmed
      live-supported, DexScreener's chain slug corrected; Blockscout
      BLOCKED not verified) + holder intelligence + minimal historical
      foundation (`HistoryStore`) + freshness tracking + data contract
      audit. See docs/LIVE_VERIFICATION.md, docs/HISTORY_SCHEMA.md,
      docs/DATA_CONTRACT_AUDIT.md.
- [x] Phase 5 — Identity resolution + intelligence refinement + evidence
      hardening: known-token registry connected to the Signal/Evidence
      pipeline, deterministic contract-beats-symbol matching, the real
      GME naming-collision case study made a permanent regression fixture.
      See docs/IDENTITY_RESOLUTION.md.

## Next up

1. **Deployer/wallet intelligence.** Needs Blockscout's transaction/
   internal-tx endpoints (1,000-record pagination cap per their docs) —
   scope a first pass around "does this contract's creator have other
   deployments" before attempting full wallet-cluster analysis. Also
   blocked, same as Blockscout holder data, on Blockscout's live wire
   shape remaining unverified (docs/LIVE_VERIFICATION.md).
2. **Phase 6 — Social + news + hype.** Every social source realistically
   needs either a paid API tier or an account-owner decision (X API access
   tier, Reddit API app registration, a licensed news feed) — see "needs
   product-owner input" in the milestone reports. The Hype Engine and
   social/on-chain relationship types are already typed in
   `packages/core/src/types/intelligence.ts` so this is additive, not a
   redesign. (This phase was originally numbered "Phase 5" in this doc's
   Phase 0-3 draft; Phase 5 was reassigned to identity resolution based on
   the actual codebase state — see the note at the top of this file.)
3. **Phase 7 — Frontend ("What HOODFLOW Sees").** Not started. Needs a
   decision on framework (Next.js is the default per the spec) and,
   separately, a decision on where this deploys. The new `identity` block
   in `HoodflowReport` (Phase 5) is what this frontend would surface to
   answer "what token am I looking at" before showing any risk/market
   content.
4. **Phase 8/9 — Hardening + deployment.** Dockerfile, CI, secrets
   management, and the deployment target itself are all blocked on a
   product-owner decision (see milestone reports) — and, separately, on
   getting this codebase pushed to a durable remote at all (still sandbox-
   only as of Phase 5 — see docs/IDENTITY_RESOLUTION.md's parent report).

## Explicitly deferred (typed but not built)

- `ACCUMULATION`, `OVERHEATED`, `DISTRIBUTION` market states (need
  holder-trend + wallet-cluster signals)
- Share card (product spec §42) — natural fit once the frontend exists
- Watchlists/alerts/subscriptions (product spec §43) — explicitly flagged
  in the spec itself as "don't prematurely implement"
