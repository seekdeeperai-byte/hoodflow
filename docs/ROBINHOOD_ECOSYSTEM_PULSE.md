# HOODFLOW — Robinhood Ecosystem Pulse

Status: FINAL GAP CLOSURE phase. Last updated 2026-09-16.

## What this answers

"What is happening across the Robinhood ecosystem right now?" — the one
genuinely **chain-level** view in HOODFLOW, additive to and never a
replacement for token-level intelligence (`GET /v1/report/:chainId/:address`
is completely unchanged). Served from a new route,
`GET /v1/pulse/:chainId?window=1h|6h|24h|7d|30d`
(`apps/api/src/routes/pulse.ts`).

## Scope (honest, not "every token on this chain")

Initial scope is Robinhood Chain (chain id **4663**) and whatever other
chain is registered in `packages/providers/src/chains.ts`. Pulse only ever
reports on:

- **Supported/verifiable entities** — tokens in HOODFLOW's own known-token
  registry for that chain (`chain.knownTokens.length` is exposed as
  `coverage.registrySize`, a coverage *denominator*, never a claim of
  "every token on this chain").
- **Data actually fetched via existing provider adapters** — Pulse makes
  zero new provider calls; see "Reuse, not recomputation" below.
- **Time windows actually supported by real observations** — a window with
  zero recorded scans reports `INSUFFICIENT_HISTORY`/`DATA_UNAVAILABLE` on
  every dimension, never a fabricated trend.

## Reuse, not recomputation

`core/pulse/pulse-engine.ts`'s `buildEcosystemPulse()` is a pure function
over scans this build has already recorded. The one new read path is
`HistoryStore.getAllScansSince(chainId, since)` — the first place the store
is asked to enumerate *across* tokens rather than per-token (every other
`HistoryStore` method is scoped to one token). `InMemoryHistoryStore`
implements it by scanning its existing `Map<string, ScanRecord[]>` for keys
with the `${chainId}:` prefix — no second store, no background scanner, no
scheduled job pretending to have ecosystem-wide coverage this build doesn't
actually have.

Every per-token figure reuses that token's own already-computed
`HoodflowReport.events`/`.dataQuality`/`.identity`/`.marketState` from its
**latest scan inside the window** (deduplicated per token via
`latestScanPerToken()`) — nothing is recomputed. Pulse is, structurally,
Intelligence Events aggregated across tokens, not a new analytical layer.

## Ten separate dimensions, never one opaque score

`EcosystemPulse.dimensions: PulseDimension[]` (`core/types/pulse.ts`) — each
dimension has its own `state`, `observationCount`, `sourceCoverage`,
`confidence`, `dataState`, `summary`, optional `value`, bounded `details[]`,
and `limitations[]`. There is no single "market mood" score anywhere in this
type.

| Dimension (`name`) | What it measures |
|---|---|
| `liquidityChanges` | Net liquidity-increase vs. decrease events across tracked tokens |
| `holderActivity` | Net holder-count-increase vs. decrease events |
| `concentrationChanges` | Net holder-concentration-increase vs. decrease events |
| `activityChanges` | Buy/sell activity-imbalance events observed |
| `identityCoverage` | Confirmed vs. unresolved (ambiguous/conflicting/unverified) identity across tracked tokens |
| `contractRiskDistribution` | How many tracked tokens' latest scan classified `CONTRACT_RISK` |
| `externalAttention` | How many tracked tokens had usable social/news data this window — attention *coverage*, never treated as on-chain evidence |
| `crossSourceSignal` | Cross-source convergence vs. divergence events observed |
| `newIntelligenceEvents` | Total Intelligence Events generated across tracked tokens' latest scans, broken out by type in `eventSummaries` |
| `dataCoverage` | `registrySize` vs. `trackedTokenCount` vs. `scanCount` — always computable, even with zero scans |

### Dimension states — MEASURED_ZERO vs. INSUFFICIENT_HISTORY

`PulseDimensionState` distinguishes a **real, informative zero**
(`MEASURED_ZERO` — real tokens were tracked this window, but none
contributed a usable observation for this specific dimension) from
genuinely having nothing to measure (`INSUFFICIENT_HISTORY` — zero tokens
tracked at all) or `DATA_UNAVAILABLE`. This is the same "missing ≠ zero"
discipline as Intelligence Events, applied at the ecosystem level: "0 of 1
tracked tokens showed a liquidity increase" (`MEASURED_ZERO`) is a different,
real fact from "no tokens were scanned this window" (`INSUFFICIENT_HISTORY`)
— the two are never conflated.

## Deterministic, bounded aggregation

- **Deterministic**: `buildEcosystemPulse()` is a pure function; the same
  input `scans[]` always produces the same output (verified by
  `packages/core/test/pulse-engine.test.ts` with `toEqual` on repeated
  calls).
- **Bounded**: `MAX_DETAIL_LINES = 10` and `MAX_EXAMPLE_TOKENS = 10` cap the
  per-dimension detail lines and the example-token-address lists in
  `eventSummaries`, regardless of how many tokens/scans are in the window —
  no unbounded output growth from a large tracked-token set.
- **No double-counting**: `latestScanPerToken()` deduplicates by token
  before any dimension is computed, so a token scanned five times in one
  window contributes once, not five times, to every dimension. Syndicated
  news double-counting is prevented upstream by the existing News Analyzer's
  story-grouping (see docs/SOCIAL_NEWS_INTELLIGENCE.md) — Pulse only reads
  its already-deduplicated `storyCount`/events, it never re-counts articles.
- **No unsupported extrapolation**: a dimension's `value` is only ever a
  literal count/aggregate over real observations this window — never a
  projected trend, never a value for a token that wasn't tracked.
- **Chain-aware**: the engine trusts its caller (`apps/api/src/routes/pulse.ts`)
  to have already scoped `scans[]` to one chain via
  `getAllScansSince(chainId, ...)` — verified directly by a test that passes
  an empty scan list for chain 46630 and confirms the engine reports that
  chain's id back with zero coverage, never mixing in another chain's data.

## API

`GET /v1/pulse/:chainId?window=1h|6h|24h|7d|30d` (default `24h`). 400 for a
malformed `chainId` or an unrecognized `window`; 404 for a chain not in
`packages/providers/src/chains.ts`; 200 with a full `EcosystemPulse` object
otherwise — including when `trackedTokenCount` is 0, in which case
`dataState: DATA_UNAVAILABLE` and every dimension reports
`INSUFFICIENT_HISTORY`, never a 4xx/5xx for "no data yet."

## Frontend

`apps/web/app/pulse/[chainId]/page.tsx` + `components/EcosystemPulse.tsx`: a
dedicated workspace with chain identity, a selectable time-window control
(re-fetches on change, since the window is a real backend query parameter,
never a frontend-only filter over one fixed payload), coverage stats,
one card per dimension (state badge, value, summary, confidence, source
coverage, bounded detail lines), recent ecosystem events, and explicit
empty/loading/unavailable states via the existing `LoadingState`/
`DataUnavailable`/`RequestStateMessage` components. Verified mobile-safe
(390px viewport, no horizontal overflow) and console-error-free in both
light and dark color schemes via a real headless-browser check — see
docs/SECURITY.md and this phase's final report for the exact check
performed. The page explicitly states Pulse "is chain-level context, not a
market-mood score, and never a trade recommendation."

## Testing

`packages/core/test/pulse-engine.test.ts` (5 tests): `DATA_UNAVAILABLE`/
`INSUFFICIENT_HISTORY` on every dimension with zero scans; real per-token
liquidity/holder event aggregation with latest-scan-per-token dedup;
`MEASURED_ZERO` distinction when tokens are tracked but no event of that
kind occurred; chain-scoping trust (the engine doesn't re-filter its input);
determinism via `toEqual` on repeated identical calls.
`packages/core/test/history-store.test.ts` adds 2 tests for
`getAllScansSince` (chain-scoped, oldest-first ordering across multiple
tokens/chains; empty array for an untracked chain).
`apps/api/test/pulse.route.test.ts` (6 tests): 400 for a malformed
`chainId`; 400 for an unrecognized `window`; 404 for an unregistered chain;
`DATA_UNAVAILABLE` with zero tracked tokens when nothing has been scanned;
a real end-to-end test (a scan via `/v1/report` is reflected in a
subsequent `/v1/pulse` call against the same `HistoryStore` instance); and
cross-chain isolation (a scan on chain 4663 never appears in chain 46630's
pulse).
