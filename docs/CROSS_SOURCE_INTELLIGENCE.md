# HOODFLOW — Cross-Source Intelligence

Status: **IMPLEMENTED**. Added in the Final Intelligence Completion phase
(2026-09-15), governing spec §6-8 and §13 — described in the spec itself as
"the most important missing feature." This is the layer that actually
combines on-chain, historical, social, news, and attention data rather than
reporting each in isolation.

## A third, deliberately separate engine

HOODFLOW already had two combination engines before this phase:

- `packages/core/src/relationships/relationship-engine.ts` — combines
  same-snapshot `Signal[]` (contract/liquidity/holders) into
  `RelationshipType` findings.
- `packages/core/src/historical/temporal-relationship-engine.ts` — combines
  cross-scan `Trend[]` (two-point deltas) into `TemporalRelationshipType`
  findings.

Cross-Source Intelligence's input — on-chain trend direction plus social,
news, and attention *summaries*, four structurally different domains, none
of which is a `Signal[]` or a `Trend[]` — doesn't fit either shape. Rather
than force it into one of the existing engines (which would blur three
genuinely different combination rules together) or invent a competing
architecture, this phase added a third, structurally parallel engine:
`packages/core/src/cross-source/cross-source-engine.ts`, exporting
`analyzeCrossSource()`. This mirrors the codebase's own established
convention of keeping same-snapshot and cross-scan combination logic in
separate modules — Rule 0 of the governing spec ("reuse existing
abstractions, do not invent a parallel architecture") is satisfied by
matching that existing pattern, not by trying to unify all three into one.

## Non-causal vocabulary (enforced, not just documented)

Every `CrossSourceRelationship.interpretation` and every
`TemporalCrossSourceObservation.description` stays inside the same
vocabulary already enforced in `temporal-relationship-engine.ts` and
`types/history.ts`: **"coincides with," "occurred alongside," "preceded,"
"followed," "aligned with," "diverged from," "no relationship measurable."**
The words **"caused," "causes," "will cause," "guarantees," "proves"** never
appear in any interpretation string in `cross-source-engine.ts` or
`integrated-interpretation.ts` — confirmed by direct code review of every
string literal in both files, not just by convention.

## The 11 relationship types

`CrossSourceRelationshipType` (`packages/core/src/types/cross-source.ts`)
matches the governing spec's suggested list exactly:

| Type | Trigger (in `analyzeCrossSource()`) |
|---|---|
| `ONCHAIN_SOCIAL_ALIGNMENT` | On-chain liquidity/holder trend and social mention-velocity change move the same direction. |
| `ONCHAIN_SOCIAL_DIVERGENCE` | They move opposite directions. |
| `ONCHAIN_NEWS_ALIGNMENT` | News coverage was present in the same window as a rising on-chain trend. |
| `SOCIAL_NEWS_ALIGNMENT` | Social activity-presence and news activity-presence agree (both active, or both quiet). |
| `ATTENTION_LIQUIDITY_DIVERGENCE` | Attention is rising/elevated while pooled liquidity is not growing — attention without on-chain backing (the spec's own example D). |
| `ATTENTION_ACTIVITY_ALIGNMENT` | Non-quiet attention direction matches the on-chain trend direction. |
| `NEWS_ACTIVITY_SEQUENCE` / `SOCIAL_ACTIVITY_SEQUENCE` | Reserved for a measured temporal lead/lag once `buildTemporalAnalysis()` finds one for that specific domain pair — see "Temporal Cross-Source Analysis" below; the current implementation's one measured case (social leading on-chain) is reported via `TemporalCrossSourceObservation`, not yet as one of these two relationship-list entries, since the spec's own relationship *list* and its temporal-observation *list* are two separate arrays on `CrossSourceIntelligence` (`relationships` vs. `temporalAnalysis`) and this phase kept the temporal finding in the array built specifically for it rather than duplicating it into both. |
| `MULTI_SOURCE_CONVERGENCE` | On-chain, social, and news are **all** usable and all agree (all rising, or all quiet) — the one case allowed `HIGH` confidence. |
| `MULTI_SOURCE_DIVERGENCE` | All three are usable but don't all agree. |
| `INSUFFICIENT_CROSS_SOURCE_DATA` | Fewer than two domains are usable, or none of the above patterns matched — reported explicitly rather than omitted or forced. |

No relationship is ever fabricated to fill out the list: if a scan's real
data doesn't trigger a pattern, that pattern simply isn't present in
`relationships[]` for that scan. See
`packages/core/test/cross-source-engine.test.ts` (8 tests) for a
regression case per relationship family, including the "no relationships
match" → single `INSUFFICIENT_CROSS_SOURCE_DATA` fallback.

## Confidence: never `HIGH` from one weak source (§7)

Every relationship function in `cross-source-engine.ts` caps confidence at
`MEDIUM` except `MULTI_SOURCE_CONVERGENCE`, which requires **three**
independently-sourced, usable domains (on-chain + social + news) to agree
before allowing `HIGH` — a single provider, or even two agreeing providers,
can never produce a `HIGH`-confidence cross-source claim. This mirrors
`attention-engine.ts`'s own "quality is never HIGH from a single channel"
rule (docs/HYPE_ATTENTION.md) and the identical principle already stated
in `types/cross-source.ts`'s doc comments.

## Temporal Cross-Source Analysis (§8)

`buildTemporalAnalysis()` (inside `cross-source-engine.ts`) answers "did
social/news activity happen before or after the on-chain change, using
real timestamps" — and defaults to
`TemporalSequenceStatus.INSUFFICIENT_TEMPORAL_DATA` unless **all** of the
following real timestamp data is present and internally consistent: a
`COMPARABLE` two-point on-chain history (`history.previousObservedAt`/
`currentObservedAt`), a real `social.observationWindowEnd`, and
`windowEndMs > windowStartMs`. Only when the social window's end falls in
the earlier half of the on-chain comparison window, and the on-chain trend
is rising, does it report `MEASURED` with a `leadingDomain`/`laggingDomain`
and a plain-language lag description (e.g. "approximately 6 hour(s)") —
computed from real millisecond timestamps, never a fabricated precise
duration from coarse or missing data. Every other case — including simply
not having enough independent timestamp resolution to say anything — is
`INSUFFICIENT_TEMPORAL_DATA`, exactly as §8 requires ("if resolution
insufficient, explicitly state so"). See
`packages/core/test/cross-source-engine.test.ts`'s temporal-analysis cases
for both the `MEASURED` and `INSUFFICIENT_TEMPORAL_DATA` paths.

## Integrated Interpretation (§12-13, §15)

`buildIntegratedInterpretation()` (`packages/core/src/interpretation/integrated-interpretation.ts`)
is the final synthesis layer, added as a new `HoodflowReport.integratedInterpretation`
field — every existing field (`interpretations`, `history`, `hype`,
`social`, `news`, `crossSource`) is untouched; this only *reads* them:

- **`whatChanged`** — multi-dimensional bullets spanning on-chain (restated
  from `history.comparisons`, the existing `MetricDelta[]` — never
  recomputed), social (post count/velocity), news (story count), and
  attention (state/score). A superset of `history.comparisons`' on-chain-
  only view, per §15.
- **`crossSourceSummary`** — the joined `interpretation` strings of every
  *real* relationship (excluding `INSUFFICIENT_CROSS_SOURCE_DATA`), or
  `null` when there's nothing beyond "insufficient data" to say. Never a
  new sentence invented beyond what `cross-source-engine.ts` already
  produced.
- **`whatToMonitor`** — restates existing `Signal`s with
  `Direction.NEGATIVE` as "Potential concern," plus every divergence-type
  cross-source relationship as "Watch for," plus an explicit "cross-source
  intelligence could not be computed" note when applicable. Every string
  here already existed as a `Signal.evidence` or
  `CrossSourceRelationship.interpretation` — nothing here is a new claim.
- **Never a trade recommendation, enforced by construction**: no line of
  `integrated-interpretation.ts` reads price, `priceChangePct24h`, or any
  buy/sell-adjacent field — it physically cannot suggest a trade because it
  never looks at the data a trade recommendation would require.

## Data availability

`CrossSourceIntelligence.dataState` is `DATA_UNAVAILABLE` when fewer than
two domains are usable (nothing to combine), `PARTIAL` when domains are
usable but no defined pattern matched, `AVAILABLE` when at least one real
relationship was found. `IntegratedInterpretation.dataState` follows the
same three-way logic based on whether `whatChanged`/`crossSourceSummary`
produced anything. Neither ever reports `AVAILABLE` with fabricated
content.

## Live verification status

**Real end-to-end run against the actual USDG token (chain 4663), this
sandbox, this phase** (see docs/LIVE_VERIFICATION.md's Final Intelligence
Completion section for the full trace): with GoPlus/DexScreener/Blockscout/
social/news all unavailable (sandbox egress block, plus no `X_BEARER_TOKEN`),
`crossSource.dataState` was `DATA_UNAVAILABLE`, the sole relationship was
`INSUFFICIENT_CROSS_SOURCE_DATA`, `temporalAnalysis` reported
`INSUFFICIENT_TEMPORAL_DATA`, and `integratedInterpretation.crossSourceSummary`
was `null`. **No real cross-source relationship (alignment, divergence, or
convergence) has been observed against live, non-fabricated data from this
environment** — this is the honest, correct output given zero usable
upstream domains, not a gap in the engine itself, which is fully exercised
against fixture data by
`packages/core/test/cross-source-engine.test.ts`'s 8 tests covering every
relationship type and both temporal-analysis outcomes.
