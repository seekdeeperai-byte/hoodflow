import {
  Confidence,
  CrossSourceDomain,
  CrossSourceRelationshipType,
  DataState,
  Direction,
  HistoryStatus,
  HypeState,
  IdentityStatus,
  MarketState,
  Strength,
  TemporalRelationshipType,
  TemporalSequenceStatus,
  TrendDirection,
  TrendType,
  type HoodflowReport,
} from "@hoodflow/core";

/**
 * ILLUSTRATIVE DEMO DATA ONLY.
 *
 * Every value below is hand-written, not computed by any analyzer, and not
 * fetched from a live token. It exists solely so a first-time visitor can
 * see what a populated HoodFlow report looks like before running a real
 * scan — the UI labels every view built from this constant as "DEMO DATA"
 * (see components/DataModeBadge.tsx) and never presents it as live.
 *
 * The shape is the real, unmodified `HoodflowReport` type from
 * `@hoodflow/core` — nothing here invents a field the backend doesn't
 * produce; it only fills in plausible values for fields that are real.
 */
const NOW = "2026-09-16T14:32:00.000Z";
const PREVIOUS = "2026-09-15T14:30:00.000Z";
const DEMO_ADDRESS = "0xdeb0000000000000000000000000000000deb0";
const DEMO_CHAIN_ID = 4663;

export const DEMO_REPORT: HoodflowReport = {
  token: { chainId: DEMO_CHAIN_ID, address: DEMO_ADDRESS, name: "Demo Protocol Token", symbol: "DEMO", decimals: 18 },
  generatedAt: NOW,
  dataFreshness: { observedAt: NOW, servedAt: NOW, ageMs: 0, status: "CURRENT" },
  identity: {
    chainId: DEMO_CHAIN_ID,
    contractAddress: DEMO_ADDRESS,
    status: IdentityStatus.CONFIRMED,
    confidence: Confidence.HIGH,
    match: {
      source: "official_docs",
      address: DEMO_ADDRESS,
      symbol: "DEMO",
      name: "Demo Protocol Token",
      note: "Illustrative registry entry for the sample report only — not a real token.",
    },
    conflicts: [],
    providerObserved: [{ provider: "goplus", name: "Demo Protocol Token", symbol: "DEMO" }],
    observedAt: NOW,
  },
  score: { dataQualityScore: 100 },
  marketState: { state: MarketState.DEMAND_EXPANSION, confidence: Confidence.MEDIUM },
  signals: [
    {
      signalType: "OWNERSHIP_RISK",
      direction: Direction.NEUTRAL,
      strength: Strength.LOW,
      confidence: Confidence.HIGH,
      source: "contract",
      evidence: "Contract ownership is held by 0xdemo...owner and has not been renounced.",
      timestamp: NOW,
    },
    {
      signalType: "LIQUIDITY_STRENGTH",
      direction: Direction.POSITIVE,
      strength: Strength.MEDIUM,
      confidence: Confidence.HIGH,
      source: "liquidity",
      evidence: "Pooled liquidity is $428,000.",
      timestamp: NOW,
    },
    {
      signalType: "BUY_SELL_IMBALANCE",
      direction: Direction.POSITIVE,
      strength: Strength.MEDIUM,
      confidence: Confidence.MEDIUM,
      source: "liquidity",
      evidence: "612 buys vs 340 sells in 24h (64% buys).",
      timestamp: NOW,
    },
    {
      signalType: "TOP10_CONCENTRATION",
      direction: Direction.NEUTRAL,
      strength: Strength.LOW,
      confidence: Confidence.MEDIUM,
      source: "holders",
      evidence: "Top 10 holders control 42.0% of supply.",
      timestamp: NOW,
    },
    {
      signalType: "HOLDER_GROWTH",
      direction: Direction.POSITIVE,
      strength: Strength.MEDIUM,
      confidence: Confidence.MEDIUM,
      source: "holders",
      evidence: "Holder count moved from 2,140 to 2,610 since the previous scan (+22.0%).",
      timestamp: NOW,
    },
    {
      signalType: "LIQUIDITY_GROWTH",
      direction: Direction.POSITIVE,
      strength: Strength.MEDIUM,
      confidence: Confidence.MEDIUM,
      source: "historical",
      evidence: "Pooled liquidity moved from $390,000 to $428,000 since the previous scan (+9.7%).",
      timestamp: NOW,
    },
    {
      signalType: "IDENTITY_CONFIRMED",
      direction: Direction.NEUTRAL,
      strength: Strength.LOW,
      confidence: Confidence.HIGH,
      source: "identity",
      evidence: "Contract address matches a registry entry sourced from official_docs.",
      timestamp: NOW,
    },
  ],
  relationships: [
    {
      relationshipType: "DEMAND_EXPANSION",
      confidence: Confidence.MEDIUM,
      supportingSignals: ["BUY_SELL_IMBALANCE", "LIQUIDITY_STRENGTH"],
      contradictingSignals: [],
      evidence: ["612 buys vs 340 sells in 24h (64% buys).", "Pooled liquidity is $428,000."],
      interpretation: "Demand appears to be broadening: buy pressure is accompanied by adequate pooled liquidity.",
    },
  ],
  interpretations: [
    {
      headline: "Demand is broadening",
      summary: "Demand appears to be broadening: buy pressure is accompanied by adequate pooled liquidity.",
      supportingMetrics: ["612 buys vs 340 sells in 24h (64% buys).", "Pooled liquidity is $428,000."],
      supportingSignals: ["BUY_SELL_IMBALANCE", "LIQUIDITY_STRENGTH"],
      contradictingSignals: [],
      confidence: Confidence.MEDIUM,
      limitations: [],
      whatWouldChangeAssessment: ["A drop in buy/sell ratio or liquidity failing to keep pace would weaken this read."],
    },
  ],
  hype: {
    score: 62,
    state: HypeState.ACCELERATING,
    quality: Confidence.MEDIUM,
    confirmation: Confidence.MEDIUM,
    components: {
      mentionVelocity: 4.2,
      mentionAcceleration: 2.1,
      uniqueAuthorGrowth: 18,
      engagementVelocity: 34.5,
      newsCoverageVelocity: 0.5,
      socialNewsConvergence: 1,
    },
    reasoning: [
      "Social data usable: 38 matching post(s), velocity 4.20/hr.",
      "News data usable: 2 distinct stories.",
      "Social mention velocity changed +100% vs. the previous scan.",
      "Classified ACCELERATING: mention velocity rose by at least 50% since the previous scan.",
    ],
  },
  social: {
    state: DataState.AVAILABLE,
    observationWindowStart: PREVIOUS,
    observationWindowEnd: NOW,
    postCount: 38,
    uniqueAuthorCount: 29,
    officialPostCount: 1,
    totalEngagement: 1310,
    mentionVelocity: 4.2,
    mentionVelocityChange: 2.1,
    observations: [],
    limitations: [],
  },
  news: {
    state: DataState.AVAILABLE,
    observationWindowStart: PREVIOUS,
    observationWindowEnd: NOW,
    articleCount: 3,
    storyCount: 2,
    storyGroups: [
      {
        representativeTitle: "Demo Protocol Token sees rising on-chain activity",
        firstPublishedAt: PREVIOUS,
        memberCount: 2,
        sources: ["outlet-a.example", "outlet-b.example"],
        members: [],
      },
      {
        representativeTitle: "Robinhood Chain ecosystem roundup mentions Demo Protocol Token",
        firstPublishedAt: NOW,
        memberCount: 1,
        sources: ["outlet-c.example"],
        members: [],
      },
    ],
    coverageVelocity: 0.5,
    limitations: [],
  },
  dataQuality: {
    contract: DataState.AVAILABLE,
    liquidity: DataState.AVAILABLE,
    holders: DataState.AVAILABLE,
    social: DataState.AVAILABLE,
    news: DataState.AVAILABLE,
    overallConfidencePenalty: null,
  },
  history: {
    status: HistoryStatus.COMPARABLE,
    observationsUsed: 2,
    currentObservedAt: NOW,
    previousObservedAt: PREVIOUS,
    comparisons: [
      {
        metric: "liquidityUsd",
        status: "INCREASED",
        previousValue: 390_000,
        currentValue: 428_000,
        previousObservedAt: PREVIOUS,
        currentObservedAt: NOW,
        absoluteChange: 38_000,
        percentChange: 9.74,
        percentagePointChange: null,
        confidence: Confidence.MEDIUM,
      },
      {
        metric: "holderCount",
        status: "INCREASED",
        previousValue: 2_140,
        currentValue: 2_610,
        previousObservedAt: PREVIOUS,
        currentObservedAt: NOW,
        absoluteChange: 470,
        percentChange: 21.96,
        percentagePointChange: null,
        confidence: Confidence.MEDIUM,
      },
      {
        metric: "top10Pct",
        status: "INCREASED",
        previousValue: 39,
        currentValue: 42,
        previousObservedAt: PREVIOUS,
        currentObservedAt: NOW,
        absoluteChange: 3,
        percentChange: null,
        percentagePointChange: 3,
        confidence: Confidence.MEDIUM,
      },
      {
        metric: "top20Pct",
        status: "UNCHANGED",
        previousValue: 58,
        currentValue: 58.4,
        previousObservedAt: PREVIOUS,
        currentObservedAt: NOW,
        absoluteChange: 0.4,
        percentChange: null,
        percentagePointChange: 0.4,
        confidence: Confidence.MEDIUM,
      },
    ],
    trends: [
      { metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM },
      { metric: "holderCount", trendType: TrendType.HOLDER_COUNT_INCREASING, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM },
      { metric: "top10Pct", trendType: TrendType.CONCENTRATION_INCREASING, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM },
    ],
    relationships: [
      {
        relationshipType: TemporalRelationshipType.CONCENTRATED_LIQUIDITY_GROWTH,
        confidence: Confidence.MEDIUM,
        supportingTrends: [TrendType.LIQUIDITY_INCREASING, TrendType.CONCENTRATION_INCREASING],
        evidence: ["Liquidity increased between the previous and current observation.", "Top-10 holder concentration also increased over the same period."],
        interpretation:
          "Liquidity increased while ownership concentration also increased. The observed data shows this liquidity growth occurred alongside rising, not broadening, concentration over this period.",
      },
    ],
  },
  crossSource: {
    dataState: DataState.AVAILABLE,
    relationships: [
      {
        relationshipType: CrossSourceRelationshipType.MULTI_SOURCE_CONVERGENCE,
        observedAt: NOW,
        sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL, CrossSourceDomain.NEWS],
        evidence: ["On-chain trend: increasing.", "Social mention velocity: increasing.", "News coverage present: true."],
        confidence: Confidence.HIGH,
        interpretation:
          "On-chain activity, social attention, and news coverage all increased over the same observation window — three independent sources converge.",
        dataState: DataState.AVAILABLE,
      },
    ],
    temporalAnalysis: [
      {
        status: TemporalSequenceStatus.MEASURED,
        leadingDomain: CrossSourceDomain.SOCIAL,
        laggingDomain: CrossSourceDomain.ONCHAIN,
        lagDescription: "approximately 6 hour(s)",
        description:
          "Social attention activity was observed to end in the earlier half of the comparison window, approximately 6 hour(s) before the on-chain increase was measured at the end of the window.",
      },
    ],
    limitations: [],
  },
  integratedInterpretation: {
    dataState: DataState.AVAILABLE,
    whatChanged: [
      "On-chain: liquidityUsd increased from 390000 to 428000 (+9.7%).",
      "On-chain: holderCount increased from 2140 to 2610 (+22.0%).",
      "Social: 38 matching post(s) observed (4.20/hr), up from the previous scan.",
      "News: 2 distinct stories observed this scan.",
      "Attention: classified ACCELERATING this scan (score 62/100).",
    ],
    crossSourceSummary:
      "On-chain activity, social attention, and news coverage all increased over the same observation window — three independent sources converge.",
    whatToMonitor: [
      "Monitor: this is illustrative demo data — see DataModeBadge. Run a real scan for a live monitoring list.",
    ],
    limitations: [],
  },
  limitations: [],
};
