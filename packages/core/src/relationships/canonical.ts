import type { Relationship } from "../types/intelligence.js";
import type { TemporalRelationship } from "../types/history.js";
import type { CrossSourceRelationship } from "../types/cross-source.js";
import { CrossSourceDomain } from "../types/cross-source.js";
import { DataState } from "../types/data-state.js";
import type { EntityRef } from "../types/entities.js";
import { RelationshipCategory, type CanonicalRelationship, type RelationshipGraph } from "../types/relationship-graph.js";

/**
 * Canonical Relationship Model adapters (FINAL GAP CLOSURE phase). Every
 * function here is a pure, lossless mapping from an existing (unchanged)
 * relationship shape into the one shared `CanonicalRelationship` envelope —
 * see types/relationship-graph.ts's header comment for why this exists and
 * what it deliberately does NOT change.
 */

function idFor(parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/:/g, "_")).join(":");
}

/**
 * `relationship-engine.ts`'s `Relationship` only ever runs on already-usable
 * (AVAILABLE/PARTIAL) market signals — see build-report.ts, where
 * `detectRelationships(signals)` is called on the market-signal set before
 * any DATA_UNAVAILABLE domain's absence is even recorded. So a TOKEN-category
 * canonical record is always `AVAILABLE` by construction, never guessed.
 */
export function fromTokenRelationship(rel: Relationship, subject: EntityRef, observedAt: string): CanonicalRelationship {
  return {
    id: idFor(["token-rel", subject.id, rel.relationshipType, observedAt]),
    category: RelationshipCategory.TOKEN,
    relationshipType: rel.relationshipType,
    observedAt,
    subject,
    sourcesInvolved: [...rel.supportingSignals, ...rel.contradictingSignals],
    evidence: rel.evidence,
    confidence: rel.confidence,
    dataState: DataState.AVAILABLE,
    interpretation: rel.interpretation,
  };
}

export function fromTemporalRelationship(rel: TemporalRelationship, subject: EntityRef, observedAt: string): CanonicalRelationship {
  return {
    id: idFor(["temporal-rel", subject.id, rel.relationshipType, observedAt]),
    category: RelationshipCategory.TEMPORAL,
    relationshipType: rel.relationshipType,
    observedAt,
    subject,
    sourcesInvolved: [...rel.supportingTrends],
    evidence: rel.evidence,
    confidence: rel.confidence,
    dataState: DataState.AVAILABLE, // same reasoning as fromTokenRelationship: only built from a COMPARABLE two-point history
    interpretation: rel.interpretation,
  };
}

const CROSS_SOURCE_DOMAIN_LABEL: Record<CrossSourceDomain, string> = {
  ONCHAIN: "onchain",
  SOCIAL: "social",
  NEWS: "news",
  ATTENTION: "attention",
};

export function fromCrossSourceRelationship(rel: CrossSourceRelationship, subject: EntityRef): CanonicalRelationship {
  return {
    id: idFor(["cross-source-rel", subject.id, rel.relationshipType, rel.observedAt]),
    category: RelationshipCategory.CROSS_SOURCE,
    relationshipType: rel.relationshipType,
    observedAt: rel.observedAt,
    subject,
    sourcesInvolved: rel.sourcesInvolved.map((d) => CROSS_SOURCE_DOMAIN_LABEL[d]),
    evidence: rel.evidence,
    confidence: rel.confidence,
    dataState: rel.dataState,
    interpretation: rel.interpretation,
  };
}

/**
 * Assembles every category's already-canonical-or-adapted relationships into
 * one graph. Ecosystem and Event relationships are passed in already built
 * as `CanonicalRelationship[]` — see ecosystem/ecosystem-engine.ts and
 * events/event-engine.ts, both of which construct this shape natively rather
 * than defining their own bespoke relationship type, which is exactly the
 * "no sixth incompatible format" guarantee this phase's architecture
 * correction requires.
 */
export function buildRelationshipGraph(input: {
  generatedAt: string;
  subject: EntityRef;
  observedAt: string;
  tokenRelationships: Relationship[];
  temporalRelationships: TemporalRelationship[];
  temporalObservedAt: string;
  crossSourceRelationships: CrossSourceRelationship[];
  ecosystemRelationships: CanonicalRelationship[];
  eventRelationships: CanonicalRelationship[];
}): RelationshipGraph {
  const relationships: CanonicalRelationship[] = [
    ...input.tokenRelationships.map((r) => fromTokenRelationship(r, input.subject, input.observedAt)),
    ...input.temporalRelationships.map((r) => fromTemporalRelationship(r, input.subject, input.temporalObservedAt)),
    ...input.crossSourceRelationships.map((r) => fromCrossSourceRelationship(r, input.subject)),
    ...input.ecosystemRelationships,
    ...input.eventRelationships,
  ];

  const categoryCounts: Record<RelationshipCategory, number> = {
    TOKEN: 0,
    TEMPORAL: 0,
    CROSS_SOURCE: 0,
    ECOSYSTEM: 0,
    EVENT: 0,
  };
  for (const rel of relationships) categoryCounts[rel.category]++;

  return { generatedAt: input.generatedAt, relationships, categoryCounts };
}
