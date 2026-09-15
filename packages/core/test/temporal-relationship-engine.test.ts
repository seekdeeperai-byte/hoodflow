import { describe, expect, it } from "vitest";
import { detectTemporalRelationships } from "../src/historical/temporal-relationship-engine.js";
import { TemporalRelationshipType, TrendDirection, TrendType, type Trend } from "../src/types/history.js";

const FORBIDDEN_CAUSAL_LANGUAGE = /\b(caused|will cause|guarantees|proves)\b/i;

function trend(metric: string, trendType: TrendType, direction: TrendDirection): Trend {
  return { metric, trendType, direction, confidence: "MEDIUM" };
}

describe("detectTemporalRelationships", () => {
  it("returns no relationships when there are no trends at all", () => {
    expect(detectTemporalRelationships([])).toEqual([]);
  });

  it("liquidity up + holders up -> LIQUIDITY_PARTICIPATION_ALIGNMENT", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
      trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
    ]);
    expect(rels.map((r) => r.relationshipType)).toEqual([TemporalRelationshipType.LIQUIDITY_PARTICIPATION_ALIGNMENT]);
  });

  it("liquidity up + concentration up -> PARTICIPATION_CONCENTRATION_DIVERGENCE when paired with holders down", () => {
    const rels = detectTemporalRelationships([
      trend("holderCount", TrendType.HOLDER_COUNT_DECREASING, TrendDirection.DECREASING),
      trend("top10Pct", TrendType.CONCENTRATION_INCREASING, TrendDirection.INCREASING),
    ]);
    expect(rels.map((r) => r.relationshipType)).toContain(TemporalRelationshipType.PARTICIPATION_CONCENTRATION_DIVERGENCE);
  });

  it("holders up + concentration down -> PARTICIPATION_CONCENTRATION_DIVERGENCE (broadening)", () => {
    const rels = detectTemporalRelationships([
      trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
      trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING),
    ]);
    expect(rels.map((r) => r.relationshipType)).toEqual([TemporalRelationshipType.PARTICIPATION_CONCENTRATION_DIVERGENCE]);
    expect(rels[0]?.interpretation).toMatch(/broadened/i);
  });

  it("liquidity up + holders down -> LIQUIDITY_PARTICIPATION_DIVERGENCE", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
      trend("holderCount", TrendType.HOLDER_COUNT_DECREASING, TrendDirection.DECREASING),
    ]);
    expect(rels.map((r) => r.relationshipType)).toEqual([TemporalRelationshipType.LIQUIDITY_PARTICIPATION_DIVERGENCE]);
  });

  it("the canonical three-way case: liquidity up + holders up + concentration down -> BROAD_BASED_LIQUIDITY_GROWTH, exclusively (no redundant two-way claims)", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
      trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
      trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING),
    ]);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.relationshipType).toBe(TemporalRelationshipType.BROAD_BASED_LIQUIDITY_GROWTH);
  });

  it("the canonical counter-example: liquidity up + holders flat + concentration up -> CONCENTRATED_LIQUIDITY_GROWTH, a different interpretation than the broad-based case", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
      trend("holderCount", TrendType.NO_TREND, TrendDirection.UNCHANGED),
      trend("top10Pct", TrendType.CONCENTRATION_INCREASING, TrendDirection.INCREASING),
    ]);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.relationshipType).toBe(TemporalRelationshipType.CONCENTRATED_LIQUIDITY_GROWTH);
    expect(rels[0]?.interpretation).not.toEqual(
      detectTemporalRelationships([
        trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
        trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
        trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING),
      ])[0]?.interpretation,
    );
  });

  it("no relationship fires when trends are flat/UNCHANGED", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.NO_TREND, TrendDirection.UNCHANGED),
      trend("holderCount", TrendType.NO_TREND, TrendDirection.UNCHANGED),
    ]);
    expect(rels).toHaveLength(0);
  });

  it("never uses causal language in any interpretation or evidence string", () => {
    const scenarios: Trend[][] = [
      [trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING), trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING)],
      [trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING), trend("holderCount", TrendType.HOLDER_COUNT_DECREASING, TrendDirection.DECREASING)],
      [trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING), trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING)],
      [
        trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
        trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
        trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING),
      ],
      [
        trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
        trend("holderCount", TrendType.NO_TREND, TrendDirection.UNCHANGED),
        trend("top10Pct", TrendType.CONCENTRATION_INCREASING, TrendDirection.INCREASING),
      ],
    ];
    for (const trends of scenarios) {
      for (const rel of detectTemporalRelationships(trends)) {
        expect(rel.interpretation).not.toMatch(FORBIDDEN_CAUSAL_LANGUAGE);
        for (const e of rel.evidence) expect(e).not.toMatch(FORBIDDEN_CAUSAL_LANGUAGE);
      }
    }
  });

  it("confidence is never HIGH — a single previous/current pair, not independent repeated samples", () => {
    const rels = detectTemporalRelationships([
      trend("liquidityUsd", TrendType.LIQUIDITY_INCREASING, TrendDirection.INCREASING),
      trend("holderCount", TrendType.HOLDER_COUNT_INCREASING, TrendDirection.INCREASING),
      trend("top10Pct", TrendType.CONCENTRATION_DECREASING, TrendDirection.DECREASING),
    ]);
    for (const rel of rels) expect(rel.confidence).not.toBe("HIGH");
  });
});
