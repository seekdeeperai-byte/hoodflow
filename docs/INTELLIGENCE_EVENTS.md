# HOODFLOW — Intelligence Events

Status: FINAL GAP CLOSURE phase. Last updated 2026-09-16.

## What this answers

"What changed?" — as a first-class, typed, deterministic feed, not buried
inside prose. `HoodflowReport.events: IntelligenceEventFeed`
(`core/types/events.ts`) is additive; every existing report field is
unchanged.

```ts
interface IntelligenceEventFeed {
  dataState: DataState;
  events: IntelligenceEvent[];
  limitations: string[];
}
```

## Zero duplicate computation

`core/events/event-engine.ts`'s `buildIntelligenceEvents()` computes
nothing that wasn't already computed elsewhere this same scan. It is a pure
function over already-built inputs:

| Event source | Reuses |
|---|---|
| Metric deltas (liquidity, holder count, top-10 concentration) | `HistoricalComparison.comparisons` (`core/historical/delta-engine.ts`) |
| Multi-metric change | `HistoricalComparison.relationships` (the TEMPORAL canonical relationships) |
| History baseline | `HistoricalComparison.status === INSUFFICIENT_HISTORY` |
| Activity imbalance | The existing `BUY_SELL_IMBALANCE` `Signal` |
| Identity confirmed/ambiguity/conflict | `snapshot.identity.status` + the previous scan's identity status |
| Social/news attention change | The existing `SOCIAL_ATTENTION_ACCELERATION`/`NEWS_COVERAGE_ACCELERATION` `Signal`s |
| Cross-source convergence/divergence | `CrossSourceIntelligence.relationships` |
| External context unavailable | A genuine usable→unavailable transition in `SocialSummary`/`NewsSummary.dataState` |
| Ecosystem relationship observed | `EcosystemIntelligence.relationships` (see docs/ECOSYSTEM_INTELLIGENCE.md) |

No event builder makes a provider call, re-reads a snapshot, or reimplements
a calculation another engine already owns.

## Taxonomy (bounded, deliberately incomplete)

`EventCategory` — `MARKET_LIQUIDITY | HOLDER | ACTIVITY | CONTRACT_IDENTITY
| HISTORICAL | EXTERNAL_CONTEXT | ECOSYSTEM`.

`EventType` is a **bounded, deterministic taxonomy** — only the event types
this phase can back with real, already-computed data, not the full
exhaustive list a future phase could imagine:

```
LIQUIDITY_INCREASE / LIQUIDITY_DECREASE
HOLDER_COUNT_INCREASE / HOLDER_COUNT_DECREASE
HOLDER_CONCENTRATION_INCREASE / HOLDER_CONCENTRATION_DECREASE
ACTIVITY_IMBALANCE_OBSERVED
IDENTITY_CONFIRMED / IDENTITY_AMBIGUITY_DETECTED / IDENTITY_CONFLICT_DETECTED
HISTORY_BASELINE_ESTABLISHED
MULTI_METRIC_CHANGE
SOCIAL_ATTENTION_CHANGE / NEWS_ACTIVITY_CHANGE
CROSS_SOURCE_CONVERGENCE_OBSERVED / CROSS_SOURCE_DIVERGENCE_OBSERVED
EXTERNAL_CONTEXT_UNAVAILABLE
ECOSYSTEM_RELATIONSHIP_OBSERVED
```

### Taxonomy and what's deliberately not included

Deliberately excluded from this phase: price-target/price-prediction events,
any "buy/sell signal" event, wallet-cluster or deployer-history events (the
underlying analyzers don't exist yet — see docs/ROADMAP.md), and any event
type whose only possible backing data is a provider domain this build has
never observed as usable. Adding a new event type later means adding it to
this bounded enum with a real data source behind it, not inferring one from
an LLM or a heuristic without traceable evidence.

## Semantics guardrails (non-fabrication)

Every event field exists to enforce one of these rules, checked per-builder,
never with a separate/weaker check than the underlying data already uses:

- **Missing ≠ zero.** A metric-delta event only fires on
  `DeltaStatus.INCREASED`/`DECREASED` — never on `UNAVAILABLE` or
  `INSUFFICIENT_HISTORY`. No history existing is `HISTORY_BASELINE_ESTABLISHED`
  (state `CONTEXTUAL`, confidence `null`, explicit "this is not evidence of
  stability, growth, or decline" description) — never fabricated as
  "liquidity decreased."
- **Unavailable ≠ false.** `EXTERNAL_CONTEXT_UNAVAILABLE` only fires on a
  genuine usable→unavailable *transition* for social or news data — never
  merely because data happens to be unavailable this scan (which would
  otherwise fire on literally every scan with no social/news provider
  configured). It is never emitted as "social activity dropped."
- **Unknown ≠ safe.** Identity events are only emitted for `CONFIRMED`,
  `AMBIGUOUS`, or `CONFLICTING` — never for `UNVERIFIED`/`UNAVAILABLE`, which
  are non-conclusions, not identity facts.
- **No repeat-fire on unchanged state.** An identity event only fires on the
  first observation of a status or a genuine transition — not every scan
  while status stays the same. Holder count being unmeasured never becomes
  "holder count is zero."
- **Conflict ≠ resolution; absence of evidence ≠ evidence of absence.**
  `IDENTITY_CONFLICT_DETECTED` reports the conflict as a fact to investigate,
  never as a resolved verdict either way.
- **Provider failure ≠ valid data.** Every builder's `dataState` reflects the
  real state of its underlying input; nothing is force-set to `AVAILABLE`.

## Significance and confidence

`significance: Strength` (LOW/MEDIUM/HIGH) is computed deterministically —
either by magnitude (`magnitudeSignificance`: ≥50% → HIGH, ≥15% → MEDIUM,
else LOW) for metric deltas, or by mapping the underlying `Confidence`
(`confidenceToSignificance`) for relationship-derived events. There is no
opaque AI model and no price prediction/trade recommendation anywhere in
this computation. `confidence: Confidence | null` is `null` **only** when
`state` is `UNAVAILABLE`/`INSUFFICIENT_DATA` — never fabricated for an event
with no real underlying confidence figure.

## Deterministic identity and deduplication

Every `IntelligenceEvent.id` is built by `eventId(parts)` (joins parts with
`:`, escaping any `:` inside a part) from a stable identity: event kind,
subject entity id, the relevant type/metric, and an observation-window
timestamp — **never** name/symbol alone. `buildIntelligenceEvents()` applies
a final, defensive `Map`-based dedup pass by id before returning, so even if
a future builder were accidentally called twice for the same fact, no
duplicate id would ever reach the API.

Ecosystem relationship events use a separate *stable* key
(`ecosystemRelationshipStableKey`, exported for reuse by `build-report.ts`)
that deliberately excludes the observation timestamp — `subject.id` +
`relationshipType` + `object?.id` — so the same real-world connection is
recognized as "already known" across scans and only re-emitted as
`ECOSYSTEM_RELATIONSHIP_OBSERVED` when it's genuinely new (see
docs/ECOSYSTEM_INTELLIGENCE.md).

## API and frontend exposure

`HoodflowReport.events` is served as part of the existing
`GET /v1/report/:chainId/:address` response — no new route. `apps/web`'s
`components/IntelligenceEvents.tsx` renders it as a neutral timeline:
event type, category, significance, confidence (when present), a factual
summary/description, evidence bullets, related entities, and timestamp. It
deliberately uses only neutral/accent/unavailable badge tones — never the
positive/negative tones this app reserves for literal measured up/down
deltas — so an event is never framed as bullish or bearish. When
`events.events` is empty, the component shows `DataUnavailable` with the
feed's own `limitations[0]`, never a blank section.

## Testing

`packages/core/test/event-engine.test.ts` (12 tests) covers: an empty feed
when nothing changed; a metric-increase event only from a real `INCREASED`
delta; `HISTORY_BASELINE_ESTABLISHED` (not a fabricated decrease) on a first
scan; `MULTI_METRIC_CHANGE` with correct relationship-id linkage; no identity
event for `UNVERIFIED`; `IDENTITY_CONFIRMED` on first observation, no
repeat-fire on unchanged status, and a transition to `CONFLICTING`;
`ACTIVITY_IMBALANCE_OBSERVED` from a real signal; social/news acceleration
events; cross-source convergence/divergence (excluding
`INSUFFICIENT_CROSS_SOURCE_DATA`); `EXTERNAL_CONTEXT_UNAVAILABLE` only on a
genuine transition; `ECOSYSTEM_RELATIONSHIP_OBSERVED` only for genuinely-new
relationships; and no duplicate event ids. `apps/api/test/report.route.test.ts`
additionally verifies, against the real running route, that hostile
provider-supplied text never inflates the event feed or overrides
`marketState`/`score` (see docs/SECURITY.md).
