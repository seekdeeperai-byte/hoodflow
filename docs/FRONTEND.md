# HOODFLOW — Frontend (Phase 8)

Status: implemented this phase, as a presentation layer only. Turns the
existing `HoodflowReport` (built by `packages/core/src/report/build-report.ts`,
through Phase 6's historical intelligence, served by `apps/api`) into a
product surface, without changing anything in `packages/core`,
`packages/providers`, or `apps/api`. See docs/ARCHITECTURE.md for the rest
of the pipeline and docs/HISTORICAL_INTELLIGENCE.md for the `history`
block this frontend spends the most space on.

## Package

```
apps/web/                Next.js 15 (App Router) + React 19
  next.config.mjs         rewrites /api/v1/* and /api/healthz to HOODFLOW_API_BASE_URL
  app/
    layout.tsx             root layout, dark theme, metadata
    page.tsx                landing page: SearchBar + DEMO_REPORT
    report/[chainId]/[address]/page.tsx   live report route (client component)
    globals.css             design tokens (dark-first, light-mode override, reduced-motion)
  components/              one component per IA layer, plus shared primitives (Badge, DataUnavailable, ui.module.css)
  lib/
    api.ts                  fetchReport() + ReportRequestState (maps real HTTP status -> UI state)
    format.ts                pure number/label formatting
    present-history.ts       MetricDelta/Trend -> display copy (no computation)
    present-signals.ts       Signal grouping/labeling by real `source` field
    present-monitoring.ts    derives "Monitoring Signals" from existing negative signals/limitations/temporal relationships
    sample-report.ts         DEMO_REPORT — hand-written, type-checked against the real HoodflowReport
  test/                     vitest unit tests for the lib/*.ts pure functions
```

Added to the workspace with zero changes to `pnpm-workspace.yaml` (already
`packages/*` + `apps/*`) or the root `build`/`test`/`typecheck` scripts
(already `-r` across `./packages/*` + `./apps/*`).

## Why Next.js

`docs/ROADMAP.md`'s Phase 8 entry already named Next.js as the default
per the product spec; no framework decision was made from scratch here.

## Data flow: API -> UI

```
apps/api (Fastify)  GET /v1/report/:chainId/:address
        |  (unchanged; zero backend modifications this phase)
next.config.mjs rewrites()   /api/v1/report/:chainId/:address  ->  ${HOODFLOW_API_BASE_URL}/v1/report/:chainId/:address
        |  (server-to-server; the browser only ever talks to the Next.js origin)
lib/api.ts fetchReport()      maps response status -> ReportRequestState
        |
app/report/[chainId]/[address]/page.tsx   holds ReportRequestState, renders LoadingState / RequestStateMessage / ReportView
        |
components/ReportView.tsx     assembles the 9 IA-layer components, in order, over one HoodflowReport
```

`HOODFLOW_API_BASE_URL` defaults to `http://localhost:8787` (the same
default `apps/api` listens on). No CORS headers were added to `apps/api`
— the browser never makes a cross-origin request, because the rewrite
happens inside the Next.js server. This was the deciding reason to use
`rewrites()` over `@fastify/cors` on the backend: it satisfies "connect to
the actual existing API... do not invent an API" without touching
`apps/api` at all.

Every intelligence value shown (deltas, trends, relationships, scores,
signals) is computed exactly once, in `packages/core`. `lib/present-*.ts`
functions are pure formatting/labeling only — verified by the fact that
every one of them is a plain function of its input with no `fetch`, no
component state, and full unit-test coverage (`apps/web/test/`). No
component recomputes a percentage, threshold, or classification the
backend already produced.

## Information architecture (9 layers, `components/ReportView.tsx`)

| # | Layer | Component | Real field(s) |
|---|-------|-----------|----------------|
| 1 | Token Identity | `TokenIdentityCard` | `report.token`, `report.identity`, `report.dataFreshness` |
| 2 | HoodFlow Score | `ScoreSummary` | `report.marketState`, `report.score.dataQualityScore` |
| 3 | Data Quality | `DataQualityPanel` | `report.dataQuality` |
| 4 | Current Market/On-Chain Signals | `MarketSnapshotCard` | `report.hype`, `report.social`, `report.news` |
| 5 | Module Analysis | `ModuleAnalysis` | `report.signals`, grouped by real `Signal.source` |
| 6 | What Changed | `WhatChanged` | `report.history.comparisons` (`MetricDelta[]`) |
| 7 | Historical Intelligence | `HistoricalIntelligence` | `report.history.trends`, `report.history.relationships` |
| 8 | Cross-Signal Interpretation | `Interpretations` | `report.interpretations` |
| 9 | Monitoring Signals | `Monitoring` | derived (presentation only) from `report.signals`/`report.history.relationships`/`report.limitations` |

### An important honesty correction from the spec's own wording

The spec's IA calls layer 2 "HOODFLOW Score" and asks for "score, risk
state, data quality." The real `HoodflowReport.score` type is
`{ dataQualityScore: number }`, explicitly documented in
`packages/core/src/types/intelligence.ts` as "NOT a buy/sell score" — this
codebase has never had, at any phase, a buy/sell/risk score field.
Inventing one to literally match the spec's layer name would violate the
task's own non-negotiable rules ("Do NOT invent... database models" /
"never present fabricated data as if it were real"). `ScoreSummary`
therefore shows the two real fields that together cover this layer's
intent — the deterministic `marketState` read and the real data-completeness
percentage — each labeled for exactly what it is, with an explicit
sentence stating `dataQualityScore` is not a recommendation.

### Cross-Signal Interpretation format

The spec asks for a SIGNAL / INTERPRETATION / WHY IT MATTERS format.
`Interpretation` (packages/core/src/types/intelligence.ts) has `headline`,
`summary`, and `whatWouldChangeAssessment` — no separate "why it matters"
field. `Interpretations.tsx` maps SIGNAL -> `headline`, INTERPRETATION ->
`summary`, and uses the backend's own `whatWouldChangeAssessment` for the
third section ("What would change this assessment") rather than
fabricating new "why it matters" prose the backend never produced.

## DATA_UNAVAILABLE handling

One shared component, `components/DataUnavailable.tsx`, is the only way
this app ever shows "we don't know": always an explicit `role="note"`
panel with the backend's own reason string, never a blank field, a zero,
or a hidden section. It's used wherever a `DataState` is not
`AVAILABLE`/`PARTIAL` (`DataQualityPanel`, `MarketSnapshotCard`) and
wherever `history.status === "INSUFFICIENT_HISTORY"` (`WhatChanged`,
`HistoricalIntelligence`) — the first-scan case is worded explicitly as
"unmeasured, not unchanged," matching Phase 6's own `MetricDelta`
semantics (`DeltaStatus.INSUFFICIENT_HISTORY` doc comment).

`lib/present-history.ts`'s `presentDelta()` is unit-tested to confirm
`INSUFFICIENT_HISTORY`/`UNAVAILABLE`/`NOT_COMPARABLE` statuses never
produce a `changeText` (a number) — only `UNCHANGED`/`INCREASED`/`DECREASED`
do. See `apps/web/test/present-history.test.ts`.

## Demo vs. live data

`components/DataModeBadge.tsx` renders "Demo data" or "Live scan" on every
report view; `app/page.tsx` always passes `mode="demo"` with the
hand-written `DEMO_REPORT`, and the live report route always passes
`mode="live"` with a real fetched report. There is no code path that can
render `DEMO_REPORT` under a "Live scan" badge or vice versa — the mode is
a literal prop set once, at the two call sites, not inferred.

## Monitoring Signals — how it avoids inventing predictive logic

`lib/present-monitoring.ts`'s `deriveMonitoringItems()` does not add any
new threshold, score, or forecast. It only re-labels three kinds of data
the backend already produced, with the spec's required vocabulary:

- every `Signal` with `direction === "NEGATIVE"` -> "Potential concern: {evidence}"
- `TemporalRelationship`s whose type is on a small explicit allowlist
  (`CONCENTRATED_LIQUIDITY_GROWTH`, `PARTICIPATION_CONCENTRATION_DIVERGENCE`,
  `LIQUIDITY_PARTICIPATION_DIVERGENCE`) -> "Watch for: {interpretation}"
- every string in `report.limitations` -> "Monitor: {limitation}"

No probability, ETA, or price prediction is ever generated. See
`apps/web/test/present-monitoring.test.ts`.

## Styling

CSS Modules (Next.js built-in, zero added dependency) over Tailwind/CSS-in-JS,
per the "no unnecessary dependencies" rule. Design tokens live in
`app/globals.css` as CSS custom properties: near-black surfaces, a single
accent blue, green/red reserved for real positive/negative direction
(`Direction`), amber for neutral/caution, and a distinct muted tone for
"unavailable" — never reused for a real negative. `@media (prefers-color-scheme: light)`
lightens surfaces without flattening the terminal aesthetic;
`@media (prefers-reduced-motion: reduce)` collapses all animation/transition
durations globally.

## States implemented

Loading (`components/LoadingState.tsx`, skeleton bars, `role="status"`,
`aria-live="polite"`), and four real backend outcomes mapped 1:1 from HTTP
status via `lib/api.ts` (`invalid_input` 400, `not_found` 404,
`rate_limited` 429, `api_error` — network failure, unparsable body, or any
other non-2xx), rendered by `components/RequestStateMessage.tsx`. A
partial report (some `DataQuality` domains unavailable) is not a separate
page state — it renders as a normal successful report, with the relevant
per-domain `DataUnavailable` panels inline, because a partial report is a
first-class successful outcome, not an error.

## What this phase did not touch

`packages/core`, `packages/providers`, `apps/api` — zero source changes.
`apps/api`'s `@fastify/cors` dependency was never added; no new route,
provider, or database model exists anywhere in this build. Score/market-state
logic, identity resolution, and historical intelligence logic are all
exactly as Phase 5/6 left them (`pnpm -w test` — 192/192 passing, no
existing test file modified).

## Known limitations (honest, not deferred silently)

- **Not visually verified in a browser.** This sandbox has no browser
  automation available for a Next.js dev/prod server; correctness here
  was validated via `tsc --noEmit`, `next build`'s own type/lint pass, and
  unit tests of every pure formatting/labeling function — not a rendered
  screenshot. Treat the visual layout as unverified until it's opened in
  an actual browser.
- **No component-level UI tests** (jsdom/React Testing Library) were
  added, to avoid touching the shared root `vitest.config.ts`
  (`environment: "node"`) that all 159 pre-existing backend tests rely on;
  only the pure `lib/*.ts` functions have unit tests.
- **Hype/social/news are real `DATA_UNAVAILABLE`/`UNKNOWN` states**, not a
  frontend bug — those providers are not implemented anywhere in this
  codebase yet (see docs/ROADMAP.md "Next up" #2).
- **Live provider network access remains unavailable from this sandbox**
  (unchanged since Phase 0) — the live report route's correctness against
  a *running* `apps/api` talking to real GoPlus/DexScreener/Blockscout
  data has not been exercised end-to-end here.
