/**
 * Canonical Relationship Model (FINAL GAP CLOSURE phase — architecture
 * correction). This is the single relationship representation this codebase
 * now uses across every relationship-producing capability. It replaces the
 * previous phase's mistake of treating Cross-Source Intelligence as a fourth,
 * structurally incompatible output format — see docs/ARCHITECTURE.md's
 * "Canonical Relationship Model" section for the full rationale and
 * docs/RELATIONSHIP_ARCHITECTURE.md for the complete design doc.
 *
 * What did NOT change: `relationships/relationship-engine.ts`
 * (`Relationship`/`RelationshipType`, same-snapshot Signals) and
 * `historical/temporal-relationship-engine.ts`
 * (`TemporalRelationship`/`TemporalRelationshipType`, cross-scan Trends)
 * still exist, are still the right place to *compute* their respective
 * pattern-detection logic, and their pre-existing report fields
 * (`HoodflowReport.relationships`, `history.relationships`) are UNCHANGED —
 * every existing test/consumer of those fields keeps working exactly as
 * before. What changed: their OUTPUT, together with Cross-Source
 * Intelligence's output and two new categories (Ecosystem, Event), is now
 * also funneled through one shared adapter layer
 * (`relationships/canonical.ts`) into this one `CanonicalRelationship`
 * shape, exposed as a single `HoodflowReport.relationshipGraph` array. There
 * is one relationship representation with five *categories*, not five
 * competing relationship engines with five incompatible formats.
 */

import type { Confidence } from "./intelligence.js";
import type { DataState } from "./data-state.js";
import type { EntityRef } from "./entities.js";

export const RelationshipCategory = {
  /** Same-snapshot Signal combinations — relationships/relationship-engine.ts. */
  TOKEN: "TOKEN",
  /** Cross-scan Trend combinations — historical/temporal-relationship-engine.ts. */
  TEMPORAL: "TEMPORAL",
  /** On-chain + social + news + attention combinations — cross-source/cross-source-engine.ts. */
  CROSS_SOURCE: "CROSS_SOURCE",
  /** Entity-to-entity connections (deployer, liquidity venue, trading pair) — ecosystem/ecosystem-engine.ts. */
  ECOSYSTEM: "ECOSYSTEM",
  /** An Intelligence Event's link back to the entity/entities it concerns — events/event-engine.ts. */
  EVENT: "EVENT",
  /**
   * Adversarial Intelligence pattern observations — adversarial/adversarial-engine.ts.
   * Added as a sixth *category* rather than as a second relationship graph,
   * which is the whole point of this model. It is deliberately not folded
   * into CROSS_SOURCE: that category means "cross-source-engine.ts's output",
   * and an adversarial pattern is a different claim (an unusual combination
   * worth attention) drawn from a different input set, so labelling it
   * CROSS_SOURCE would make the category field lie about provenance.
   */
  ADVERSARIAL: "ADVERSARIAL",
} as const;
export type RelationshipCategory = (typeof RelationshipCategory)[keyof typeof RelationshipCategory];

/**
 * One relationship record, regardless of which category produced it.
 * `relationshipType` stays a plain string here (each category's own typed
 * enum — `RelationshipType`, `TemporalRelationshipType`,
 * `CrossSourceRelationshipType`, and the new Ecosystem/Event type strings —
 * is still the source of truth for what values are valid within that
 * category; this canonical shape doesn't re-type-check across categories,
 * it just gives them one common envelope).
 */
export interface CanonicalRelationship {
  /** Stable, deterministic — see relationships/canonical.ts for the exact scheme per category. */
  id: string;
  category: RelationshipCategory;
  relationshipType: string;
  observedAt: string;
  subject: EntityRef;
  object?: EntityRef;
  /** Signal types (TOKEN), Trend types (TEMPORAL), or domain names (CROSS_SOURCE/ECOSYSTEM/EVENT) that this relationship draws evidence from. */
  sourcesInvolved: string[];
  /** Plain factual sentences — never a verdict, same convention as every other evidence array in this codebase. */
  evidence: string[];
  /** Reuses the existing 3-tier Confidence model unchanged — no parallel confidence scale. */
  confidence: Confidence;
  /** Reuses the existing DataState model unchanged — no parallel availability scale. */
  dataState: DataState;
  /** Non-causal only, same vocabulary rule already enforced for TEMPORAL/CROSS_SOURCE relationships — see cross-source/cross-source-engine.ts's header comment. Applies to every category here. */
  interpretation: string;
}

export interface RelationshipGraph {
  generatedAt: string;
  relationships: CanonicalRelationship[];
  categoryCounts: Record<RelationshipCategory, number>;
}
