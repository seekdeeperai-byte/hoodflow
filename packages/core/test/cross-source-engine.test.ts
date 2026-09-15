import { describe, expect, it } from "vitest";
import { analyzeCrossSource } from "../src/cross-source/cross-source-engine.js";
import { DataState } from "../src/types/data-state.js";
import { HypeState } from "../src/types/intelligence.js";
import { TrendDirection, TrendType, HistoryStatus, type HistoricalComparison } from "../src/types/history.js";
import type { NewsSummary, SocialSummary } from "../src/types/social-news.js";

const NOW = "2026-09-14T18:00:00.000Z";
const PREVIOUS = "2026-09-13T18:00:00.000Z";

function history(overrides: Partial<HistoricalComparison> = {}): HistoricalComparison {
  return {
    status: HistoryStatus.COMPARABLE,
    observationsUsed: 2,
    currentObservedAt: NOW,
    previousObservedAt: PREVIOUS,
    comparisons: [],
    trends: [],
    relationships: [],
    ...overrides,
  };
}

const insufficientHistory: HistoricalComparison = {
  status: HistoryStatus.INSUFFICIENT_HISTORY,
  observationsUsed: 1,
  currentObservedAt: NOW,
  previousObservedAt: null,
  comparisons: [],
  trends: [],
  relationships: [],
};

function social(overrides: Partial<SocialSummary> = {}): SocialSummary {
  return { dataState: DataState.DATA_UNAVAILABLE, observations: [], limitations: [], ...overrides };
}
function news(overrides: Partial<NewsSummary> = {}): NewsSummary {
  return { dataState: DataState.DATA_UNAVAILABLE, storyGroups: [], limitations: [], ...overrides };
}
const unknownHype = { score: null, state: HypeState.UNKNOWN, quality: "UNKNOWN" as const, confirmation: "UNKNOWN" as const };

describe("analyzeCrossSource", () => {
  it("honestly reports INSUFFICIENT_CROSS_SOURCE_DATA — never a fabricated relationship — when fewer than 2 domains are usable (the expected real-world sandbox outcome)", () => {
    const result = analyzeCrossSource({ now: NOW, social: social(), news: news(), hype: unknownHype, history: insufficientHistory });
    expect(result.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]?.relationshipType).toBe("INSUFFICIENT_CROSS_SOURCE_DATA");
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("detects ONCHAIN_SOCIAL_ALIGNMENT when on-chain liquidity is rising and social mention velocity is also rising", () => {
    const h = history({ trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, mentionVelocity: 5, mentionVelocityChange: 2 }),
      news: news(),
      hype: unknownHype,
      history: h,
    });
    const rel = result.relationships.find((r) => r.relationshipType === "ONCHAIN_SOCIAL_ALIGNMENT");
    expect(rel).toBeDefined();
    expect(rel?.confidence).not.toBe("HIGH"); // two domains only — never HIGH from this alone
  });

  it("detects ONCHAIN_SOCIAL_DIVERGENCE when on-chain is rising but social attention is falling", () => {
    const h = history({ trends: [{ metric: "holderCount", trendType: TrendType.HOLDER_COUNT_INCREASING, direction: TrendDirection.INCREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, mentionVelocity: 1, mentionVelocityChange: -2 }),
      news: news(),
      hype: unknownHype,
      history: h,
    });
    expect(result.relationships.some((r) => r.relationshipType === "ONCHAIN_SOCIAL_DIVERGENCE")).toBe(true);
  });

  it("detects ATTENTION_LIQUIDITY_DIVERGENCE when attention is elevated but liquidity is not growing (spec example D)", () => {
    const h = history({ trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_DECREASING, direction: TrendDirection.DECREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, postCount: 500 }),
      news: news(),
      hype: { score: 80, state: HypeState.HIGH_ATTENTION, quality: "MEDIUM", confirmation: "LOW" },
      history: h,
    });
    expect(result.relationships.some((r) => r.relationshipType === "ATTENTION_LIQUIDITY_DIVERGENCE")).toBe(true);
  });

  it("only allows HIGH confidence for MULTI_SOURCE_CONVERGENCE, and only when all three independent domains agree", () => {
    const h = history({ trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, mentionVelocity: 5, mentionVelocityChange: 3 }),
      news: news({ dataState: DataState.AVAILABLE, storyCount: 4 }),
      hype: { score: 60, state: HypeState.ACCELERATING, quality: "MEDIUM", confirmation: "MEDIUM" },
      history: h,
    });
    const convergence = result.relationships.find((r) => r.relationshipType === "MULTI_SOURCE_CONVERGENCE");
    expect(convergence).toBeDefined();
    expect(convergence?.confidence).toBe("HIGH");
    expect(convergence?.sourcesInvolved.length).toBe(3);
  });

  it("never uses causal language in any interpretation — only the allowed non-causal vocabulary", () => {
    const h = history({ trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, mentionVelocity: 5, mentionVelocityChange: 3 }),
      news: news({ dataState: DataState.AVAILABLE, storyCount: 4 }),
      hype: { score: 60, state: HypeState.ACCELERATING, quality: "MEDIUM", confirmation: "MEDIUM" },
      history: h,
    });
    for (const rel of result.relationships) {
      expect(rel.interpretation.toLowerCase()).not.toMatch(/\bcaused\b|\bcauses\b|\bwill cause\b|\bguarantees\b|\bproves\b/);
    }
  });

  it("temporal analysis returns INSUFFICIENT_TEMPORAL_DATA when history is not yet comparable", () => {
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, postCount: 5, observationWindowEnd: NOW }),
      news: news(),
      hype: unknownHype,
      history: insufficientHistory,
    });
    expect(result.temporalAnalysis[0]?.status).toBe("INSUFFICIENT_TEMPORAL_DATA");
  });

  it("temporal analysis reports MEASURED with a leading domain when social activity clearly precedes the on-chain increase within the window", () => {
    const h = history({ trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: "MEDIUM" }] });
    const result = analyzeCrossSource({
      now: NOW,
      social: social({ dataState: DataState.AVAILABLE, postCount: 5, observationWindowEnd: "2026-09-13T20:00:00.000Z" }), // shortly after previous scan, well before window midpoint
      news: news(),
      hype: unknownHype,
      history: h,
    });
    expect(result.temporalAnalysis[0]?.status).toBe("MEASURED");
    expect(result.temporalAnalysis[0]?.leadingDomain).toBe("SOCIAL");
    expect(result.temporalAnalysis[0]?.laggingDomain).toBe("ONCHAIN");
  });
});
