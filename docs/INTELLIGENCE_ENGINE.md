# HOODFLOW — Intelligence Engine

## Pipeline

```
TokenSnapshot (normalized provider data, per-domain DataState, + resolved identity)
  -> analyzeContract() / analyzeLiquidity() / analyzeHolders()   Signal[]
  -> detectRelationships()                       Relationship[]      (market signals only)
  -> buildEvidence()                              EvidenceItem[]     (market signals only)
  -> buildInterpretations() + buildContractInterpretation()   Interpretation[]
  -> selectMarketState()                          { state, confidence }
  -> analyzeIdentity()                            Signal[]           (appended after the above — see docs/IDENTITY_RESOLUTION.md)
  -> buildHistoricalComparison()                  HistoricalComparison  (Phase 6 — see docs/HISTORICAL_INTELLIGENCE.md)
  -> buildHistoricalSignals()                     Signal[]           (appended after the above, same reasoning as identity)
  -> buildReport()                                HoodflowReport
```

Identity signals (`source: "identity"`) are added to the final `signals`
array *after* relationships/evidence/marketState are computed from the
market-only signal set — this is deliberate, not an oversight: identity
risk (Phase 5) is conceptually separate from contract/market risk and must
never influence `marketState` or `score.dataQualityScore`. See
docs/IDENTITY_RESOLUTION.md "Score integrity." Historical signals
(`source: "historical"`, Phase 6) follow the exact same placement and the
exact same reasoning — see docs/HISTORICAL_INTELLIGENCE.md "Score
integrity."

Entry point: `packages/core/src/report/build-report.ts::buildReport`. It is
a pure function — no I/O, no network, no randomness — so it's trivially
unit-testable (see `packages/core/test/build-report.test.ts`) and the same
function will back both the live API route and, later, a batch
re-scoring job over historical snapshots.

## Signal Engine

Each analyzer (`analyzers/contract-analyzer.ts`, `analyzers/liquidity-analyzer.ts`)
takes normalized domain data and emits zero or more `Signal` objects. A
signal is never derived from an absent field — the analyzers only branch on
fields that are actually present in the normalized data, so "no data" never
silently becomes "no risk."

## Relationship Engine

`relationships/relationship-engine.ts` looks for known combinations across
the full signal set (see docs/SCORING.md for the current rule set:
`LIQUIDITY_LAGGING_ACTIVITY`, `DEMAND_EXPANSION`, `SPECULATIVE_OVERHEATING`,
`COOLING`). Every relationship it emits carries `supportingSignals`,
`contradictingSignals`, `evidence`, and a plain-language `interpretation` —
never just a label. This is the mechanism for product spec §16: "do not
simply display independent signals."

## Evidence Engine

`evidence/evidence-engine.ts` is deliberately a *second pass* over the full
signal list, independent of whichever signals the Relationship Engine
happened to use. This matters: a relationship built only by looking at
agreeing signals would cherry-pick by construction. The Evidence Engine
re-scans every signal for anything that points the other way and, if it
finds one the Relationship Engine didn't already account for, adds it to
`contradictingMetrics` and downgrades confidence one level. See
`packages/core/test/relationship-engine.test.ts` for a concrete example
(a `DEMAND_EXPANSION` relationship gets a `TOP10_CONCENTRATION` contradiction
attached even though the relationship rule that built it never looked at
holder concentration).

## Interpretation Engine

`interpretation/interpretation-engine.ts` is template-based and
deterministic — see `HEADLINES` and `whatWouldChange()`. No LLM is called
in this build. An `LLMRewriter` interface exists (same file) for a future
language-polish pass, with a hard constraint enforced by the interface
shape itself: it takes a `headline`/`summary` *already computed* and can
only return replacement prose for those two fields — it has no way to touch
signals, confidence, evidence, or market state, because the deterministic
report is fully built before any LLM step would run. If an LLM rewrite
fails or is skipped, the deterministic headline/summary already computed
*is* the interpretation, not a degraded fallback — this satisfies product
spec §32 ("if the LLM fails, HOODFLOW must still work") structurally rather
than by convention.

## Market State Engine

`interpretation/market-state.ts::selectMarketState` — see docs/SCORING.md
for the exact priority order. The one invariant worth calling out here:
**it is impossible for this function to return anything other than
`INSUFFICIENT_DATA` when `signals.length === 0`** — that's the first line
of the function, not a fallthrough at the end, so "guess a state from
nothing" isn't reachable by construction.

## Historical Intelligence (Phase 6)

Two-point (previous-scan vs. current-scan) comparison, trend
classification, and a small set of cross-metric temporal relationships —
see docs/HISTORICAL_INTELLIGENCE.md for the full design. Deliberately not
a general time-series/charting feature: wallet-cluster/deployer-history
analyzers and true multi-point rate-of-change ("NOW → 1H → 6H → 24H → 7D")
remain unbuilt (see "What isn't built yet" below) — `HistoryStore`'s
`getScansSince` is already the right primitive for that later, once a
minimum-sample-size policy exists to keep it meaningful rather than noise.

## What isn't built yet

- Holder-trend / wallet-cluster / deployer-history analyzers (need the data
  sources first — see docs/DATA_SOURCES.md).
- Hype Engine, Social Engine, News Engine, and the social/on-chain
  relationship types (`ATTENTION_CONFIRMATION`, `SOCIAL_OVERHEATING`, etc.)
  — typed in `packages/core/src/types/intelligence.ts` where reasonable,
  not implemented. `HoodflowReport.hype`/`.social`/`.news` are always
  `UNKNOWN`/`DATA_UNAVAILABLE` in this build, truthfully.
- Multi-point rate/velocity intelligence (e.g. "liquidity growth is
  accelerating") — Phase 6 explicitly deferred this: the two-point
  comparison it built is meaningful on its own, and bolting on a
  velocity/acceleration metric without a real minimum-sample-size policy
  would risk presenting noise ("100k → 101k") as a meaningful trend. See
  docs/HISTORICAL_INTELLIGENCE.md "Why two-point comparison only."
- A Postgres-backed `HistoryStore` (still the in-memory implementation
  from Phase 4 — see docs/HISTORY_SCHEMA.md).
