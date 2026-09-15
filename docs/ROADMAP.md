# HOODFLOW — Roadmap

Status snapshot: 2026-09-15 (Final Intelligence Completion phase — the
last planned development phase for this build; per that phase's own
governing spec, this document is not being extended with a new future
phase list here). Phases below are working-order guesses at the
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
- [x] Phase 10 — Production-network live provider verification attempt:
      re-tested (not assumed) whether this execution environment could
      reach GoPlus/DexScreener/Blockscout via the repo's own provider
      client code. Confirmed, with fresh proxy-log evidence, the same
      policy-level egress block as every prior phase since Phase 0 — this
      was not the network-enabled environment the phase's own premise
      expected. Re-proved the full pipeline end-to-end against a real
      running API (two sequential scans, INSUFFICIENT_HISTORY →
      COMPARABLE, zero fabricated data). Checked GitHub remote/auth status
      per the phase's own rules: `github.com` is reachable from this
      sandbox but no git credential helper is configured, so no remote was
      added and nothing was pushed. Found and documented a real
      discrepancy in the Phase 9 write-up's `WebFetch`-sourced GoPlus
      holder-count figure — reinforcing why that supplementary check was
      always correctly treated as non-authoritative. No provider/core code
      changed. See docs/LIVE_VERIFICATION.md's Phase 10 section.
- [x] Phase 11 — Durable-remote attempt + deployment readiness + security
      audit: re-tested GitHub remote/auth status more rigorously than
      Phase 10 (`git credential fill` run directly, not just config
      inspection) — still no credential mechanism configured here;
      re-confirmed the provider egress block with per-host `curl -v` +
      correlated proxy-log evidence. The actual yield of this phase: a
      first-ever deployment readiness audit found and fixed two real bugs
      neither provider testing nor prior phases had caught — (1) a
      cross-chain data-integrity bug where `apps/api` could have
      misattributed real mainnet Blockscout holder data to a testnet-chain
      report (fixed by gating the Blockscout call behind the chain it's
      actually configured for, mirroring DexScreener's existing slug gate;
      regression test added); (2) 2 HIGH + 2 moderate `pnpm audit`
      advisories on a transitive `apps/web` production dependency
      (`postcss`, via `next`), fixed with a version-pin override and
      re-verified at zero vulnerabilities. Also added `apps/web/.env.example`
      (parity with `apps/api`'s, a genuine deployment-reproducibility gap)
      and corrected two stale documentation claims (a pre-Phase-8 "no CORS
      needed yet" note, and a pre-Phase-8 "zero prod vulnerabilities" audit
      note that had stopped covering `apps/web`'s dependency tree). 195
      tests passing (194 + 1 new regression test), typecheck clean, build
      clean, verified against the actual production build
      (`dist/server.js` / `next start`), not just the dev server. See
      docs/LIVE_VERIFICATION.md's Phase 11 section, docs/DATA_CONTRACT_AUDIT.md's
      Phase 11 addendum, and docs/SECURITY.md's Phase 11 recheck.
- [x] Final Intelligence Completion phase — Social Intelligence (real X API
      v2 client, `SocialObservation`/`SocialSummary`), News Intelligence
      (real GDELT DOC 2.0 client, deterministic event classification,
      syndicated-story de-duplication), Attention/Hype Intelligence (a
      fully-exposed, documented formula over real social+news activity —
      not a meme score, not a buy/sell signal), and Cross-Source
      Intelligence (a third relationship engine combining on-chain +
      historical + social + news + attention across 11 typed relationship
      categories, non-causal language enforced, Temporal Cross-Source
      Analysis requiring real timestamps or explicit
      `INSUFFICIENT_TEMPORAL_DATA`), plus a final Integrated Interpretation
      synthesis layer (what changed / do sources agree / where they
      diverge / what to monitor — explicitly never a trade recommendation).
      This is the item this doc's "Next up" list below previously called
      "Phase 7 — Social + news + hype"; it's now done and folded in here
      rather than left as a stale forward-looking entry. Fully additive:
      every pre-existing type/engine/route/UI section unchanged in shape
      and behavior (proved by the pre-existing 195 tests all still passing
      unmodified, plus 82 new tests — 277 total). Entity resolution reuses
      the exact contract-beats-symbol principle from Phase 5's identity
      resolution; a hostile prompt-injection-style string was proven, by
      test, to flow through the full pipeline as inert data. Both new
      providers (GDELT, X) remain **SANDBOX BLOCKED** from this
      environment, re-confirmed with the same rigor as every prior
      provider — no relationship or signal was ever fabricated when real
      social/news/attention data was genuinely unavailable end-to-end
      against the real USDG token. See docs/SOCIAL_NEWS_INTELLIGENCE.md,
      docs/HYPE_ATTENTION.md, docs/CROSS_SOURCE_INTELLIGENCE.md, and
      docs/LIVE_VERIFICATION.md's Final Intelligence Completion section.

## Remaining known limitations (not a future-phase plan)

The Final Intelligence Completion phase was this build's last planned
development phase (its own governing spec, §27, explicitly directs against
proposing further phases here). The items below are honest, pre-existing
gaps carried forward from earlier phases — operational/credential/
infrastructure limitations, not unstarted product features that this
build's scope ever covered:

- **Deployer/wallet intelligence.** Never implemented in any phase of this
  build. Needs Blockscout's transaction/internal-tx endpoints
  (1,000-record pagination cap per their docs) — a first pass would scope
  around "does this contract's creator have other deployments" before
  attempting full wallet-cluster analysis. Blocked, same as Blockscout
  holder data, on Blockscout's live wire shape remaining unverified
  (docs/LIVE_VERIFICATION.md).
- **Multi-point rate/velocity intelligence.** Phase 6 explicitly deferred
  this (see docs/HISTORICAL_INTELLIGENCE.md "Why two-point comparison
  only") — `HistoryStore.getScansSince` is already the right primitive,
  but it needs a real minimum-sample-size policy first so a genuine
  acceleration (100k → 120k → 180k) isn't confused with noise
  (100k → 101k). Not addressed this phase.
- **Hardening + deployment.** Dockerfile, CI, secrets management, a
  Postgres-backed `HistoryStore` (docs/HISTORY_SCHEMA.md), and the
  deployment target itself remain blocked on a product-owner decision —
  and, separately, on getting this codebase pushed to a durable remote at
  all. Re-checked this phase with the same rigor as Phase 10/11: no git
  credential mechanism is configured in this environment (see
  docs/LIVE_VERIFICATION.md's Final Intelligence Completion section for
  this phase's own confirmation). A deployment target decision also needs
  to cover `apps/web` (e.g. does it deploy alongside `apps/api`, or
  separately with `HOODFLOW_API_BASE_URL` pointed at a deployed API) — see
  docs/FRONTEND.md.
- **Live provider verification for GDELT/X.** Both clients are real,
  tested against fixtures, and confirmed (via a fake-token wiring check for
  X) to attempt real network calls correctly — but neither has executed
  successfully against live traffic from any environment, since this
  sandbox's egress block applies to them the same as every other provider.
  `scripts/verify-live-providers.ts` now covers both and is the
  reproducible way to close this gap from an environment with real egress
  (and, for X, a funded Bearer token).
- **Additional social/news sources** (Reddit, Telegram, a licensed news
  feed) remain unimplemented — each needs its own account/app-registration
  or licensing decision from whoever owns production credentials, exactly
  as X did before this phase. Both `SocialObservation`/`NewsObservation`
  are shaped so a second client can be added behind the same normalized
  types without touching any downstream analyzer.

Phase 8 — Frontend ("What HOODFLOW Sees") and the Final Intelligence
Completion phase's four new sections are both in "Done" above; the
`identity` (Phase 5), `history` (Phase 6), `social`/`news`/`hype`/
`crossSource`/`integratedInterpretation` (Final Intelligence Completion
phase) blocks in `HoodflowReport` are what they surface, exactly as
anticipated at each phase.

## Explicitly deferred (typed but not built)

- `ACCUMULATION`, `OVERHEATED`, `DISTRIBUTION` market states (need
  holder-trend + wallet-cluster signals)
- Share card (product spec §42) — natural fit once the frontend exists
- Watchlists/alerts/subscriptions (product spec §43) — explicitly flagged
  in the spec itself as "don't prematurely implement"
