# HOODFLOW — Ecosystem Intelligence

Status: FINAL GAP CLOSURE phase. Last updated 2026-09-16.

## What this answers

"What is connected to this token?" `HoodflowReport.ecosystem:
EcosystemIntelligence` (`core/types/ecosystem.ts`) is additive; every
existing report field is unchanged.

```ts
interface EcosystemIntelligence {
  dataState: DataState;
  subject: EntityRef;
  entities: EntityRef[];   // every entity referenced by `relationships`, deduplicated, subject first
  relationships: CanonicalRelationship[]; // always category: "ECOSYSTEM" — see docs/RELATIONSHIP_ARCHITECTURE.md
  limitations: string[];
}
```

There is no separate `EcosystemRelationship` type. `core/ecosystem/
ecosystem-engine.ts` constructs `CanonicalRelationship` records directly,
with `category: "ECOSYSTEM"` — the same envelope every other
relationship-producing capability uses (see
docs/RELATIONSHIP_ARCHITECTURE.md).

## Zero new provider calls

`buildEcosystemIntelligence()` is built **only** from data this pipeline
has already fetched this same scan:

- `ContractSecurityData.creatorAddress` (from GoPlus) → `DEPLOYED_BY`
- `LiquiditySnapshot.dexId` + `.pairAddress` (from DexScreener) →
  `TRADES_ON` and `LIQUIDITY_CONNECTED_TO`

No new HTTP client, no new provider adapter, no new analyzer for a metric
already computed elsewhere. This directly follows the "no duplicate
provider framework" requirement.

## Never inferred from a name, symbol, or narrative

Both relationship kinds implemented here are structural on-chain/provider
facts, not narrative claims — a token is never linked to a deployer, venue,
or pair because its name/symbol/branding/social claims happen to match
something else. The contract-beats-symbol identity rule (see
docs/IDENTITY_RESOLUTION.md) is respected the same way here: only
address-level, provider-reported facts create an edge.

When neither contract nor liquidity data is usable, `buildEcosystemIntelligence()`
returns `dataState: DATA_UNAVAILABLE` with explicit `limitations[]` — never
an empty-but-`AVAILABLE` graph, and never a relationship inferred from
whatever contextual data *is* present. When exactly one domain is usable but
doesn't report the field a relationship needs (e.g. contract data is usable
but `creatorAddress` is `null`), `dataState` is `PARTIAL` with a limitation
explaining which domain and why.

## Entity identity (chain-aware, normalized — see docs/RELATIONSHIP_ARCHITECTURE.md)

Every `EntityRef.id` (`core/types/entities.ts`) is chain-aware specifically
to prevent the failure mode of a deployer address (or any entity) colliding
across two different chains that happen to reuse the same address:
`deployer:4663:0x...` and `deployer:46630:0x...` are always distinct
entities, never merged. Addresses are lowercased before being embedded in an
id so casing differences never produce two different entities for the same
real address.

Bounded entity types this phase covers: `TOKEN`, `CONTRACT`, `WALLET`,
`DEPLOYER`, `LIQUIDITY_VENUE`, `TRADING_PAIR`, `CHAIN`, `NEWS_SOURCE`,
`SOCIAL_SOURCE`, `INTELLIGENCE_EVENT`. Only entities actually backed by real
evidence this scan are ever added to `entities[]` — `WALLET`,
`NEWS_SOURCE`, and `SOCIAL_SOURCE` are modeled for future phases (a
wallet-cluster analyzer, a per-source ecosystem view) and not yet populated
by any builder in this phase; see docs/ROADMAP.md.

## Bounded graph behavior

- **Bounded depth.** `buildEcosystemIntelligence()` only ever produces
  direct, one-hop relationships from the subject token (deployer, venue,
  pair) — there is no traversal beyond what this scan's own contract/
  liquidity data supports, and no recursive expansion into a deployer's
  other tokens or a venue's other pairs.
- **Deterministic ordering.** Relationships are pushed in a fixed order
  (`DEPLOYED_BY`, then `TRADES_ON`, then `LIQUIDITY_CONNECTED_TO`) so the
  same input always produces the same output order.
- **No duplicate edges.** Each relationship kind is derived from exactly one
  underlying field per scan (one `creatorAddress`, one `dexId`+`pairAddress`
  pair) — there is no loop that could emit the same edge twice within one
  call.
- **Stable IDs**, via the same `idFor`-style scheme every canonical
  relationship uses: `ecosystem-rel:<subject.id>:<TYPE>:<object.id>:<observedAt>`.

## API and frontend exposure

`HoodflowReport.ecosystem` is served as part of the existing
`GET /v1/report/:chainId/:address` response — no new route (Robinhood
Ecosystem Pulse, the chain-level view, is a separate, genuinely new route —
see docs/ROBINHOOD_ECOSYSTEM_PULSE.md). `apps/web`'s
`components/EcosystemIntelligence.tsx` renders connected entities as badges
(addresses truncated for mobile-safe display, full value in a `title`
attribute) and each relationship with its confidence, evidence, and
non-causal interpretation. When `ecosystem.relationships` is empty, the
component shows `DataUnavailable` with the field's own `limitations[0]`,
never a blank or fabricated section, and always ends with an explicit
"HoodFlow never infers a relationship from a matching name, symbol, or
unverified narrative" disclosure.

## Testing

`packages/core/test/ecosystem-engine.test.ts` (6 tests) covers:
`DATA_UNAVAILABLE` and zero fabricated entities when both domains are
unusable; `DEPLOYED_BY` only from a real `creatorAddress`; no `DEPLOYED_BY`
without one; `TRADES_ON`/`LIQUIDITY_CONNECTED_TO` only from a real
`dexId`+`pairAddress`; no fabrication from name/symbol alone; and deployer
entity IDs correctly scoped by chain (no cross-chain collision).
`apps/api/test/report.route.test.ts` additionally verifies, against the real
running route, that hostile provider-supplied `creatorAddress`/`dexId`/
`pairAddress` text flows through as inert entity/evidence data only — never
executable content, never a false attribution, and never an override of
`marketState`/`score` (see docs/SECURITY.md).
