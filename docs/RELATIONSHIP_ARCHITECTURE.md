# HOODFLOW — Canonical Relationship Model

Status: FINAL GAP CLOSURE phase. Last updated 2026-09-16.

## Why this document exists

A prior phase's governing spec flagged a critical architecture defect:
Cross-Source Intelligence (`core/cross-source/cross-source-engine.ts`) was
added as a **third relationship-producing engine**, alongside
`core/relationships/relationship-engine.ts` and
`core/historical/temporal-relationship-engine.ts`, each with its own,
structurally incompatible output shape (`Relationship`, `TemporalRelationship`,
`CrossSourceRelationship` — three different interfaces, no shared fields
beyond a loose family resemblance). That directly conflicts with this
project's "no parallel architectures" rule. This phase was required to
introduce two *more* relationship-producing capabilities (Ecosystem
Intelligence, Intelligence Events) — doing that on top of the existing
pattern would have produced a fourth and fifth incompatible format instead
of fixing the underlying problem.

## The fix: one envelope, five categories

`core/types/relationship-graph.ts` defines `CanonicalRelationship`, the one
relationship record shape this codebase now uses everywhere a relationship
is produced:

```ts
interface CanonicalRelationship {
  id: string;                    // stable, deterministic — see "ID schemes" below
  category: RelationshipCategory; // TOKEN | TEMPORAL | CROSS_SOURCE | ECOSYSTEM | EVENT
  relationshipType: string;       // each category's own typed enum remains the source of truth
  observedAt: string;
  subject: EntityRef;
  object?: EntityRef;
  sourcesInvolved: string[];
  evidence: string[];
  confidence: Confidence;         // the existing 3-tier scale — no parallel scale
  dataState: DataState;           // the existing DataState enum — no parallel scale
  interpretation: string;         // non-causal, same convention as every other evidence string
}
```

`RelationshipCategory` is explicitly documented as **categories, not
independent engines**:

| Category | Produced by | What did NOT change |
|---|---|---|
| `TOKEN` | `relationship-engine.ts`'s `detectRelationships(signals)` | Untouched — same function, same `Relationship`/`RelationshipType`, same call site in `build-report.ts` |
| `TEMPORAL` | `temporal-relationship-engine.ts` | Untouched — same function, same `TemporalRelationship`/`TemporalRelationshipType`, still reached via `history.relationships` |
| `CROSS_SOURCE` | `cross-source-engine.ts` | Untouched — same function, same `CrossSourceRelationship`, still reached via `report.crossSource.relationships` |
| `ECOSYSTEM` | `core/ecosystem/ecosystem-engine.ts` (new this phase) | N/A — new capability, built natively in canonical form |
| `EVENT` | `core/events/event-engine.ts` (an event's link to the entities it concerns; new this phase) | N/A — new capability, built natively in canonical form |

**`HoodflowReport.relationships` and `HoodflowReport.history.relationships`
are unchanged fields, unchanged shape, unchanged behavior.** Every existing
test and consumer of those two fields keeps working exactly as it did before
this phase. What's new is a *third, additive* top-level field,
`HoodflowReport.relationshipGraph: RelationshipGraph`, which re-expresses
every relationship this report produced — TOKEN + TEMPORAL + CROSS_SOURCE +
ECOSYSTEM + EVENT — in the one shared envelope, for any consumer (the
frontend, a future analytics job, a future sixth relationship-producing
capability) that wants a single, uniform list instead of five separately
shaped ones.

```ts
interface RelationshipGraph {
  generatedAt: string;
  relationships: CanonicalRelationship[];
  categoryCounts: Record<RelationshipCategory, number>;
}
```

## The adapter layer

`core/relationships/canonical.ts` is a pure, lossless mapping layer — it
computes nothing new, it only re-shapes existing outputs:

- `fromTokenRelationship(rel, subject, observedAt)` — wraps a `Relationship`.
  Always `dataState: AVAILABLE` by construction, because
  `detectRelationships()` only ever runs on already-usable market signals
  (see `build-report.ts`).
- `fromTemporalRelationship(rel, subject, observedAt)` — wraps a
  `TemporalRelationship`. Always `dataState: AVAILABLE` by construction, same
  reasoning: only built from a `COMPARABLE` two-point history.
- `fromCrossSourceRelationship(rel, subject)` — wraps a
  `CrossSourceRelationship`, preserving its own real `dataState` (a
  cross-source relationship can legitimately be `PARTIAL` when fewer than
  two domains have usable data — see docs/CROSS_SOURCE_INTELLIGENCE.md).
- `buildRelationshipGraph(input)` — combines all five categories.
  Ecosystem and Event relationships are passed in **already built** as
  `CanonicalRelationship[]` (see docs/ECOSYSTEM_INTELLIGENCE.md and
  docs/INTELLIGENCE_EVENTS.md) — they never define their own bespoke
  relationship type, which is exactly the guarantee that stops this from
  becoming a sixth incompatible format down the line.

### ID schemes (deterministic, stable)

Every adapter derives its `CanonicalRelationship.id` from `idFor(parts)`,
which joins the parts with `:` (with any `:` inside a part escaped to `_`
first, so it can't be confused with the separator). The parts always include
the subject's own stable entity id and the relationship's own type, so the
same underlying observation always produces the same id — this is what lets
downstream consumers (in particular Intelligence Events' ecosystem-dedup
logic, see docs/INTELLIGENCE_EVENTS.md) compare relationship identity across
scans reliably.

## Shared entity identity

`core/types/entities.ts`'s `EntityRef`/`EntityType` and its constructor
functions (`tokenEntity`, `chainEntity`, `contractEntity`, `deployerEntity`,
`liquidityVenueEntity`, `tradingPairEntity`, `newsSourceEntity`,
`socialSourceEntity`, `eventEntity`) are the **one** entity-identity scheme
used by the relationship graph, Ecosystem Intelligence, and Intelligence
Events alike — not three separately invented ones. Every id is:

- **Chain-aware** — `token:4663:0xabc...` and `token:46630:0xabc...` are
  different entities, deliberately, so the same address on two different
  chains never collides into one (see docs/ECOSYSTEM_INTELLIGENCE.md's
  "Entity identity" section for the failure mode this prevents).
- **Normalized** — addresses are lowercased before being embedded in an id,
  so the same address in different casing never produces two different
  entities.

## What this correction guarantees, and how it's tested

- No second evidence/relationship/history engine was introduced.
- No duplicate provider framework was introduced (Ecosystem Intelligence
  makes zero new provider calls; see docs/ECOSYSTEM_INTELLIGENCE.md).
- No separate, incompatible event graph was introduced — Intelligence
  Events link back into the same canonical graph via the `EVENT` category.
- No frontend-only fake intelligence — every `CanonicalRelationship` the
  frontend renders came from `report.relationshipGraph`/`report.ecosystem`,
  computed server-side, never invented in `apps/web`.
- No separate/duplicate/conflicting scoring system — `confidence` and
  `dataState` are the existing enums, not new parallel scales.

`packages/core/test/relationship-graph.test.ts` proves: each adapter's
output shape and field mapping is correct and lossless; `buildRelationshipGraph`
combines all five categories with correct `categoryCounts`; and IDs are
deterministic (same input twice produces the same id) and unique across
distinct inputs. Every pre-existing test of `relationships`,
`history.relationships`, and `crossSource.relationships` continues to pass
unmodified — see `packages/core/test/relationship-engine.test.ts`,
`temporal-relationship-engine.test.ts`, and `cross-source-engine.test.ts`.
