import { describe, expect, it } from "vitest";
import { buildIntelligenceEvents, ecosystemRelationshipStableKey } from "../src/events/event-engine.js";
import { DataState } from "../src/types/data-state.js";
import { Confidence, Direction, SignalType, Strength, type Signal } from "../src/types/intelligence.js";
import { DeltaStatus, HistoryStatus, TemporalRelationshipType, TrendType, type HistoricalComparison } from "../src/types/history.js";
import { IdentityStatus } from "../src/types/identity.js";
import { CrossSourceDomain, CrossSourceRelationshipType, type CrossSourceIntelligence } from "../src/types/cross-source.js";
import type { NewsSummary, SocialSummary } from "../src/types/social-news.js";
import { RelationshipCategory } from "../src/types/relationship-graph.js";
import { tokenEntity } from "../src/types/entities.js";

const NOW = "2026-09-16T12:00:00.000Z";
const PREVIOUS = "2026-09-15T12:00:00.000Z";
const CHAIN_ID = 4663;
const ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

function emptyHistory(overrides: Partial<HistoricalComparison> = {}): HistoricalComparison {
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
function crossSourceUnavailable(): CrossSourceIntelligence {
  return { dataState: DataState.DATA_UNAVAILABLE, relationships: [], temporalAnalysis: [], limitations: [] };
}

const baseInput = {
  chainId: CHAIN_ID,
  address: ADDRESS,
  generatedAt: NOW,
  history: emptyHistory(),
  identityStatus: IdentityStatus.UNVERIFIED,
  identityConfidence: null,
  signals: [] as Signal[],
  social: social(),
  news: news(),
  crossSource: crossSourceUnavailable(),
  ecosystemRelationships: [],
  previousEcosystemRelationshipIds: new Set<string>(),
};

describe("buildIntelligenceEvents", () => {
  it("emits nothing (a real, honest empty feed) when nothing changed and no data is available", () => {
    const feed = buildIntelligenceEvents(baseInput);
    expect(feed.events).toHaveLength(0);
    expect(feed.dataState).toBe(DataState.PARTIAL);
    expect(feed.limitations.length).toBeGreaterThan(0);
  });

  it("emits LIQUIDITY_INCREASE only from a real INCREASED MetricDelta, never from UNAVAILABLE/UNCHANGED/INSUFFICIENT_HISTORY", () => {
    const history = emptyHistory({
      comparisons: [
        { metric: "liquidityUsd", status: DeltaStatus.INCREASED, previousValue: 100, currentValue: 150, previousObservedAt: PREVIOUS, currentObservedAt: NOW, absoluteChange: 50, percentChange: 50, percentagePointChange: null, confidence: Confidence.MEDIUM },
        { metric: "holderCount", status: DeltaStatus.UNCHANGED, previousValue: 10, currentValue: 10, previousObservedAt: PREVIOUS, currentObservedAt: NOW, absoluteChange: 0, percentChange: 0, percentagePointChange: null, confidence: Confidence.MEDIUM },
        { metric: "top10Pct", status: DeltaStatus.UNAVAILABLE, previousValue: null, currentValue: null, previousObservedAt: PREVIOUS, currentObservedAt: NOW, absoluteChange: null, percentChange: null, percentagePointChange: null, confidence: null },
      ],
    });
    const feed = buildIntelligenceEvents({ ...baseInput, history });
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]?.eventType).toBe("LIQUIDITY_INCREASE");
    expect(feed.events[0]?.significance).toBe(Strength.HIGH); // 50% change
    expect(feed.events[0]?.state).toBe("MEASURED");
    expect(feed.events[0]?.previousValue).toBe(100);
    expect(feed.events[0]?.currentValue).toBe(150);
  });

  it("emits HISTORY_BASELINE_ESTABLISHED, never a fabricated LIQUIDITY_DECREASE, on the first scan of a token", () => {
    const feed = buildIntelligenceEvents({ ...baseInput, history: insufficientHistory });
    expect(feed.events.some((e) => e.eventType === "LIQUIDITY_DECREASE" || e.eventType === "LIQUIDITY_INCREASE")).toBe(false);
    const baseline = feed.events.find((e) => e.eventType === "HISTORY_BASELINE_ESTABLISHED");
    expect(baseline).toBeDefined();
    expect(baseline?.state).toBe("CONTEXTUAL");
    expect(baseline?.confidence).toBeNull();
  });

  it("emits MULTI_METRIC_CHANGE from a real TemporalRelationship and links it to the canonical relationship id", () => {
    const history = emptyHistory({
      relationships: [
        {
          relationshipType: TemporalRelationshipType.BROAD_BASED_LIQUIDITY_GROWTH,
          confidence: Confidence.HIGH,
          supportingTrends: [TrendType.LIQUIDITY_INCREASING, TrendType.HOLDER_COUNT_INCREASING],
          evidence: ["Liquidity and holders both increased."],
          interpretation: "A broadening pattern was observed.",
        },
      ],
    });
    const feed = buildIntelligenceEvents({ ...baseInput, history });
    const event = feed.events.find((e) => e.eventType === "MULTI_METRIC_CHANGE");
    expect(event).toBeDefined();
    expect(event?.significance).toBe(Strength.HIGH);
    expect(event?.relatedRelationshipIds.length).toBe(1);
  });

  it("does not emit an identity event for UNVERIFIED/UNAVAILABLE status (a non-conclusion is not a positive event)", () => {
    const feed = buildIntelligenceEvents({ ...baseInput, identityStatus: IdentityStatus.UNVERIFIED });
    expect(feed.events.some((e) => e.category === "CONTRACT_IDENTITY")).toBe(false);
  });

  it("emits IDENTITY_CONFIRMED on first observation, and only re-emits an identity event on a real status transition", () => {
    const first = buildIntelligenceEvents({ ...baseInput, identityStatus: IdentityStatus.CONFIRMED, identityConfidence: Confidence.HIGH });
    expect(first.events.some((e) => e.eventType === "IDENTITY_CONFIRMED")).toBe(true);

    const unchanged = buildIntelligenceEvents({
      ...baseInput,
      identityStatus: IdentityStatus.CONFIRMED,
      identityConfidence: Confidence.HIGH,
      previousIdentityStatus: IdentityStatus.CONFIRMED,
    });
    expect(unchanged.events.some((e) => e.category === "CONTRACT_IDENTITY")).toBe(false);

    const transitioned = buildIntelligenceEvents({
      ...baseInput,
      identityStatus: IdentityStatus.CONFLICTING,
      identityConfidence: Confidence.LOW,
      previousIdentityStatus: IdentityStatus.CONFIRMED,
    });
    expect(transitioned.events.some((e) => e.eventType === "IDENTITY_CONFLICT_DETECTED")).toBe(true);
  });

  it("emits ACTIVITY_IMBALANCE_OBSERVED only when a real BUY_SELL_IMBALANCE signal is present", () => {
    const signal: Signal = {
      signalType: SignalType.BUY_SELL_IMBALANCE,
      direction: Direction.POSITIVE,
      strength: Strength.MEDIUM,
      confidence: Confidence.MEDIUM,
      source: "liquidity",
      evidence: "Buys outpaced sells 3:1 over 24h.",
      timestamp: NOW,
    };
    const feed = buildIntelligenceEvents({ ...baseInput, signals: [signal] });
    expect(feed.events.some((e) => e.eventType === "ACTIVITY_IMBALANCE_OBSERVED")).toBe(true);
  });

  it("derives SOCIAL_ATTENTION_CHANGE and NEWS_ACTIVITY_CHANGE directly from the existing acceleration signals, never recomputing them", () => {
    const socialSignal: Signal = {
      signalType: SignalType.SOCIAL_ATTENTION_ACCELERATION,
      direction: Direction.NEUTRAL,
      strength: Strength.HIGH,
      confidence: Confidence.MEDIUM,
      source: "social",
      evidence: "Mention velocity doubled.",
      timestamp: NOW,
    };
    const newsSignal: Signal = {
      signalType: SignalType.NEWS_COVERAGE_ACCELERATION,
      direction: Direction.NEUTRAL,
      strength: Strength.MEDIUM,
      confidence: Confidence.MEDIUM,
      source: "news",
      evidence: "Coverage velocity rose 30%.",
      timestamp: NOW,
    };
    const feed = buildIntelligenceEvents({ ...baseInput, signals: [socialSignal, newsSignal] });
    expect(feed.events.some((e) => e.eventType === "SOCIAL_ATTENTION_CHANGE")).toBe(true);
    expect(feed.events.some((e) => e.eventType === "NEWS_ACTIVITY_CHANGE")).toBe(true);
  });

  it("derives CROSS_SOURCE_CONVERGENCE_OBSERVED / DIVERGENCE_OBSERVED directly from real crossSource relationships, never from INSUFFICIENT_CROSS_SOURCE_DATA", () => {
    const crossSource: CrossSourceIntelligence = {
      dataState: DataState.AVAILABLE,
      relationships: [
        {
          relationshipType: CrossSourceRelationshipType.MULTI_SOURCE_CONVERGENCE,
          observedAt: NOW,
          sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL, CrossSourceDomain.NEWS],
          evidence: ["All three sources rose."],
          confidence: Confidence.HIGH,
          interpretation: "Three independent sources converge.",
          dataState: DataState.AVAILABLE,
        },
        {
          relationshipType: CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA,
          observedAt: NOW,
          sourcesInvolved: [],
          evidence: [],
          confidence: Confidence.LOW,
          interpretation: "Unmeasured.",
          dataState: DataState.DATA_UNAVAILABLE,
        },
      ],
      temporalAnalysis: [],
      limitations: [],
    };
    const feed = buildIntelligenceEvents({ ...baseInput, crossSource });
    expect(feed.events.filter((e) => e.category === "EXTERNAL_CONTEXT" && e.eventType.startsWith("CROSS_SOURCE"))).toHaveLength(1);
    expect(feed.events.find((e) => e.eventType === "CROSS_SOURCE_CONVERGENCE_OBSERVED")?.significance).toBe(Strength.HIGH);
  });

  it("emits EXTERNAL_CONTEXT_UNAVAILABLE only on a genuine usable-to-unavailable transition, never merely because data is unavailable", () => {
    const stillUnavailable = buildIntelligenceEvents({ ...baseInput, social: social(), previousSocial: social() });
    expect(stillUnavailable.events.some((e) => e.eventType === "EXTERNAL_CONTEXT_UNAVAILABLE")).toBe(false);

    const becameUnavailable = buildIntelligenceEvents({
      ...baseInput,
      social: social({ dataState: DataState.PROVIDER_UNAVAILABLE }),
      previousSocial: social({ dataState: DataState.AVAILABLE, postCount: 5 }),
    });
    expect(becameUnavailable.events.some((e) => e.eventType === "EXTERNAL_CONTEXT_UNAVAILABLE")).toBe(true);
  });

  it("emits ECOSYSTEM_RELATIONSHIP_OBSERVED only for a relationship not present in the previous scan's stable-key set", () => {
    const subject = tokenEntity(CHAIN_ID, ADDRESS);
    const rel = {
      id: "ecosystem-rel:x",
      category: RelationshipCategory.ECOSYSTEM,
      relationshipType: "DEPLOYED_BY",
      observedAt: NOW,
      subject,
      object: { entityType: "DEPLOYER" as const, id: "deployer:4663:0xabc" },
      sourcesInvolved: ["contract"],
      evidence: ["creator reported"],
      confidence: Confidence.MEDIUM,
      dataState: DataState.AVAILABLE,
      interpretation: "Deployed by X.",
    };

    const firstTime = buildIntelligenceEvents({ ...baseInput, ecosystemRelationships: [rel] });
    expect(firstTime.events.some((e) => e.eventType === "ECOSYSTEM_RELATIONSHIP_OBSERVED")).toBe(true);

    const alreadySeen = buildIntelligenceEvents({
      ...baseInput,
      ecosystemRelationships: [rel],
      previousEcosystemRelationshipIds: new Set([ecosystemRelationshipStableKey(rel)]),
    });
    expect(alreadySeen.events.some((e) => e.eventType === "ECOSYSTEM_RELATIONSHIP_OBSERVED")).toBe(false);
  });

  it("never produces two events with the same id", () => {
    const history = emptyHistory({
      comparisons: [
        { metric: "liquidityUsd", status: DeltaStatus.INCREASED, previousValue: 100, currentValue: 150, previousObservedAt: PREVIOUS, currentObservedAt: NOW, absoluteChange: 50, percentChange: 50, percentagePointChange: null, confidence: Confidence.MEDIUM },
      ],
    });
    const feed = buildIntelligenceEvents({ ...baseInput, history });
    const ids = new Set(feed.events.map((e) => e.id));
    expect(ids.size).toBe(feed.events.length);
  });
});
