import { describe, expect, it } from "vitest";
import { buildRelationshipGraph, fromCrossSourceRelationship, fromTemporalRelationship, fromTokenRelationship } from "../src/relationships/canonical.js";
import { RelationshipCategory } from "../src/types/relationship-graph.js";
import { Confidence, RelationshipType, type Relationship } from "../src/types/intelligence.js";
import { TemporalRelationshipType, TrendType, type TemporalRelationship } from "../src/types/history.js";
import { CrossSourceDomain, CrossSourceRelationshipType, type CrossSourceRelationship } from "../src/types/cross-source.js";
import { DataState } from "../src/types/data-state.js";
import { tokenEntity } from "../src/types/entities.js";

const NOW = "2026-09-16T12:00:00.000Z";
const subject = tokenEntity(4663, "0x5fc5360d0400a0fd4f2af552add042d716f1d168");

const tokenRel: Relationship = {
  relationshipType: RelationshipType.DEMAND_EXPANSION,
  confidence: Confidence.MEDIUM,
  supportingSignals: ["BUY_SELL_IMBALANCE"],
  contradictingSignals: [],
  evidence: ["Buy pressure detected."],
  interpretation: "Demand appears to be broadening.",
};

const temporalRel: TemporalRelationship = {
  relationshipType: TemporalRelationshipType.BROAD_BASED_LIQUIDITY_GROWTH,
  confidence: Confidence.MEDIUM,
  supportingTrends: [TrendType.LIQUIDITY_INCREASING, TrendType.HOLDER_COUNT_INCREASING],
  evidence: ["Liquidity and holder count both increased."],
  interpretation: "Liquidity and holder count coincide with a broadening pattern.",
};

const crossSourceRel: CrossSourceRelationship = {
  relationshipType: CrossSourceRelationshipType.ONCHAIN_SOCIAL_ALIGNMENT,
  observedAt: NOW,
  sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL],
  evidence: ["On-chain and social both rising."],
  confidence: Confidence.MEDIUM,
  interpretation: "Social attention aligned with the on-chain trend.",
  dataState: DataState.AVAILABLE,
};

describe("canonical relationship adapters", () => {
  it("maps a TOKEN relationship into the canonical envelope with category TOKEN and dataState AVAILABLE", () => {
    const canonical = fromTokenRelationship(tokenRel, subject, NOW);
    expect(canonical.category).toBe(RelationshipCategory.TOKEN);
    expect(canonical.relationshipType).toBe("DEMAND_EXPANSION");
    expect(canonical.confidence).toBe(Confidence.MEDIUM);
    expect(canonical.dataState).toBe(DataState.AVAILABLE);
    expect(canonical.subject).toEqual(subject);
    expect(canonical.evidence).toEqual(tokenRel.evidence);
    expect(canonical.interpretation).toBe(tokenRel.interpretation);
  });

  it("maps a TEMPORAL relationship into the canonical envelope with category TEMPORAL", () => {
    const canonical = fromTemporalRelationship(temporalRel, subject, NOW);
    expect(canonical.category).toBe(RelationshipCategory.TEMPORAL);
    expect(canonical.sourcesInvolved).toEqual(["LIQUIDITY_INCREASING", "HOLDER_COUNT_INCREASING"]);
  });

  it("maps a CROSS_SOURCE relationship into the canonical envelope, preserving its own dataState (not forcing AVAILABLE)", () => {
    const canonical = fromCrossSourceRelationship(crossSourceRel, subject);
    expect(canonical.category).toBe(RelationshipCategory.CROSS_SOURCE);
    expect(canonical.dataState).toBe(DataState.AVAILABLE);
    expect(canonical.sourcesInvolved).toEqual(["onchain", "social"]);
  });

  it("buildRelationshipGraph combines all five categories into one array with correct per-category counts", () => {
    const ecosystemRel = {
      id: "ecosystem-rel:test",
      category: RelationshipCategory.ECOSYSTEM,
      relationshipType: "DEPLOYED_BY",
      observedAt: NOW,
      subject,
      sourcesInvolved: ["contract"],
      evidence: ["creator address reported"],
      confidence: Confidence.MEDIUM,
      dataState: DataState.AVAILABLE,
      interpretation: "Deployed by X.",
    };
    const eventRel = {
      id: "event-rel:test",
      category: RelationshipCategory.EVENT,
      relationshipType: "EVENT_INVOLVES_ENTITY",
      observedAt: NOW,
      subject,
      sourcesInvolved: ["history"],
      evidence: ["liquidity increased"],
      confidence: Confidence.MEDIUM,
      dataState: DataState.AVAILABLE,
      interpretation: "Liquidity increased.",
    };

    const graph = buildRelationshipGraph({
      generatedAt: NOW,
      subject,
      observedAt: NOW,
      tokenRelationships: [tokenRel],
      temporalRelationships: [temporalRel],
      temporalObservedAt: NOW,
      crossSourceRelationships: [crossSourceRel],
      ecosystemRelationships: [ecosystemRel],
      eventRelationships: [eventRel],
    });

    expect(graph.relationships).toHaveLength(5);
    // ADVERSARIAL is the sixth category (adversarial/adversarial-engine.ts). It is 0 here
    // because this fixture passes no adversarial relationships — the count must still be
    // present and explicitly zero rather than absent, so a consumer reading
    // categoryCounts never has to distinguish "no such category" from "none found".
    expect(graph.categoryCounts).toEqual({ TOKEN: 1, TEMPORAL: 1, CROSS_SOURCE: 1, ECOSYSTEM: 1, EVENT: 1, ADVERSARIAL: 0 });
    // Every relationship, regardless of category, uses the exact same shared shape — reuses
    // the same Confidence/DataState models, never a category-specific parallel scale.
    for (const rel of graph.relationships) {
      expect(Object.keys(rel).sort()).toEqual(
        ["category", "confidence", "dataState", "evidence", "id", "interpretation", "object", "observedAt", "relationshipType", "sourcesInvolved", "subject"]
          .filter((k) => k !== "object" || rel.object !== undefined)
          .sort(),
      );
    }
  });

  it("produces unique, deterministic ids across categories for the same subject/timestamp", () => {
    const a = fromTokenRelationship(tokenRel, subject, NOW);
    const b = fromTemporalRelationship(temporalRel, subject, NOW);
    const c = fromCrossSourceRelationship(crossSourceRel, subject);
    const ids = new Set([a.id, b.id, c.id]);
    expect(ids.size).toBe(3);
    // Deterministic: calling again with the same inputs produces the same id.
    expect(fromTokenRelationship(tokenRel, subject, NOW).id).toBe(a.id);
  });
});
