# HOODFLOW — Roadmap

Status snapshot: 2026-09-15. Phases below are working-order guesses at the
dependency graph, adjusted from the product spec's suggested order where
research showed a better sequence, and — as of Phase 5, and again as of
Phase 6 — adjusted again based on the actual state of the codebase rather
than followed mechanically (the user's own explicit instruction each
phase: decide the next highest-value step from what's actually built, not
from a fixed list). The phase *numbers* below reflect what was actually
built in each numbered phase, which has diverged from this doc's original
Phase 0-3 guesses — this file is corrected in place rather than left
stale, per the "living document" convention used throughout docs/. Most
recent renumbering: Phase 6 turned out to be historical intelligence (not
social/news/hype, this doc's earlier guess) — social/news/hype, the
frontend, and hardening/deployment have each shifted down one number
accordingly. Phase 9 was then actually spent on a live-data provider audit
(not hardening/deployment, this doc's prior guess for that number) — so
hardening/deployment is listed below without a fixed number until it's
actually scheduled, rather than guessing another number that may shift
again.

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
- [x] Phase 6 — Historical intelligence + temporal relationships: two-point
      (previous-scan vs. current-scan) delta engine, trend classification,
      a small set of cross-metric temporal relationships (liquidity/
      holders/concentration), historical signals/evidence, all exposed via
      `HoodflowReport.history`. Reused the existing Phase 4 `HistoryStore`
      unchanged; proved by test that score/marketState are unaffected by
      history's presence or absence. See docs/HISTORICAL_INTELLIGENCE.md.
- [x] Phase 8 — Frontend ("What HOODFLOW Sees"): `apps/web` (Next.js 15 +
      React 19), a presentation-only layer over the unmodified
      `HoodflowReport` — zero changes to `packages/core`,
      `packages/providers`, or `apps/api`. All 9 information-architecture
      layers from the product spec, a DEMO/LIVE-labeled sample report, and
      real DATA_UNAVAILABLE/first-scan handling throughout. See
      docs/FRONTEND.md.
- [x] Phase 8.1 — Browser QA + UX polish: real-browser (headless Chromium)
      validation of the Phase 8 frontend, contrast/typography/responsive
      fixes found only by actually rendering the app (see
      `apps/web/app/globals.css`, `apps/web/components/ui.module.css`,
      `apps/web/components/WhatChanged.tsx`) — no new features, no report
      schema changes.
- [x] Phase 9 — Live data provider audit + real-data integration attempt:
      full re-audit of the GoPlus/DexScreener/Blockscout/RPC provider
      pipeline against the actual repository (not assumed from prior
      docs); re-confirmed GoPlus and DexScreener's live API shape via a
      policy-trusted fetch path with fresh data nine days after Phase 4
      (holder_count moved, proving currency); confirmed the sandbox's
      general network still cannot reach any provider, including via the
      repo's own `scripts/verify-live-providers.ts` run against the real
      client code; proved the full pipeline (identity, dataQuality,
      marketState, Historical Intelligence's INSUFFICIENT_HISTORY→
      COMPARABLE transition) end-to-end against a real running API with
      zero fabricated data even with every external provider unavailable;
      closed two confirmed provider test-coverage gaps
      (`packages/providers/test/dexscreener.test.ts`,
      `.../blockscout.test.ts`). No provider became live-reachable from
      this sandbox; no provider/core code changed. See
      docs/LIVE_VERIFICATION.md and docs/DATA_CONTRACT_AUDIT.md.

## Next up

1. **Deployer/wallet intelligence.** Needs Blockscout's transaction/
   internal-tx endpoints (1,000-record pagination cap per their docs) —
   scope a first pass around "does this contract's creator have other
   deployments" before attempting full wallet-cluster analysis. Also
   blocked, same as Blockscout holder data, on Blockscout's live wire
   shape remaining unverified (docs/LIVE_VERIFICATION.md). No deployer
   analyzer or wallet-intelligence provider exists at all yet — confirmed
   during the Phase 9 audit, not newly discovered.
2. **Phase 7 — Social + news + hype.** Every social source realistically
   needs either a paid API tier or an account-owner decision (X API access
   tier, Reddit API app registration, a licensed news feed) — see "needs
   product-owner input" in the milestone reports. The Hype Engine and
   social/on-chain relationship types are already typed in
   `packages/core/src/types/intelligence.ts` so this is additive, not a
   redesign. (This phase was originally numbered "Phase 5", then "Phase 6",
   in this doc's earlier drafts; those numbers were reassigned to identity
   resolution and historical intelligence respectively, based on the
   actual codebase state each phase — see the note at the top of this
   file.)
3. **Multi-point rate/velocity intelligence.** Phase 6 explicitly deferred
   this (see docs/HISTORICAL_INTELLIGENCE.md "Why two-point comparison
   only") — `HistoryStore.getScansSince` is already the right primitive,
   but it needs a real minimum-sample-size policy first so a genuine
   acceleration (100k → 120k → 180k) isn't confused with noise
   (100k → 101k).
4. **Hardening + deployment (next numbered phase, exact number TBD).**
   Dockerfile, CI, secrets
   management, a Postgres-backed `HistoryStore` (docs/HISTORY_SCHEMA.md),
   and the deployment target itself are all blocked on a product-owner
   decision (see milestone reports) — and, separately, on getting this
   codebase pushed to a durable remote at all (still sandbox-only as of
   Phase 8 — see docs/HISTORICAL_INTELLIGENCE.md's parent report). A
   deployment target decision also now needs to cover `apps/web` (e.g. does
   it deploy alongside `apps/api`, or separately with
   `HOODFLOW_API_BASE_URL` pointed at a deployed API) — see docs/FRONTEND.md.

Phase 8 — Frontend ("What HOODFLOW Sees") moved to "Done" above; the
`identity` (Phase 5) and `history` (Phase 6) blocks in `HoodflowReport` are
what it surfaces first, exactly as anticipated here.

## Explicitly deferred (typed but not built)

- `ACCUMULATION`, `OVERHEATED`, `DISTRIBUTION` market states (need
  holder-trend + wallet-cluster signals)
- Share card (product spec §42) — natural fit once the frontend exists
- Watchlists/alerts/subscriptions (product spec §43) — explicitly flagged
  in the spec itself as "don't prematurely implement"
