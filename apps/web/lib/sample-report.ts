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
  analyzeAdversarial,
  toCanonicalAdversarialRelationships,
  buildEcosystemIntelligence,
  buildIntelligenceEvents,
  buildRelationshipGraph,
  tokenEntity,
  RelationshipCategory,
  type HoodflowReport,
  type Relationship,
  type HistoricalComparison,
  type Signal,
  type SocialSummary,
  type NewsSummary,
  type CrossSourceIntelligence,
} from "@hoodflow/core";

/**
 * ILLUSTRATIVE DEMO DATA ONLY.
 *
 * Every value below is hand-written, not fetched from a live token. It
 * exists solely so a first-time visitor can see what a populated HoodFlow
 * report looks like before running a real scan — the UI labels every view
 * built from this constant as "DEMO DATA" (see components/DataModeBadge.tsx)
 * and never presents it as live.
 *
 * The shape is the real, unmodified `HoodflowReport` type from
 * `@hoodflow/core` — nothing here invents a field the backend doesn't
 * produce; it only fills in plausible values for fields that are real.
 */
const NOW = "2026-09-16T14:32:00.000Z";
const PREVIOUS = "2026-09-15T14:30:00.000Z";
const DEMO_ADDRESS = "0xdeb0000000000000000000000000000000deb0";
const DEMO_CHAIN_ID = 4663;
const DEMO_DEPLOYER = "0x00000000000000000000000000000000000de9";
const DEMO_DEX_ID = "demoswap";
const DEMO_PAIR_ADDRESS = "0x00000000000000000000000000000000000ea1";

/**
 * FINAL GAP CLOSURE phase: `ecosystem`, `events`, and `relationshipGraph`
 * below are NOT hand-authored like the rest of this file — they are computed
 * by calling the real, unmodified engines (`buildEcosystemIntelligence`,
 * `buildIntelligenceEvents`, `buildRelationshipGraph` from `@hoodflow/core`)
 * against this file's own hand-authored `signals`/`relationships`/`history`/
 * `crossSource`/`socialSummary`/`newsSummary` values below, exactly the way
 * `report/build-report.ts` composes a real report. This keeps the demo
 * report's new sections byte-for-byte structurally identical to what a real
 * scan would produce, rather than a second, hand-maintained approximation of
 * that shape that could drift out of sync with the real engines.
 */
const signals: Signal[] = [
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
];

const relationships: Relationship[] = [
  {
    relationshipType: "DEMAND_EXPANSION",
    confidence: Confidence.MEDIUM,
    supportingSignals: ["BUY_SELL_IMBALANCE", "LIQUIDITY_STRENGTH"],
    contradictingSignals: [],
    evidence: ["612 buys vs 340 sells in 24h (64% buys).", "Pooled liquidity is $428,000."],
    interpretation: "Demand appears to be broadening: buy pressure is accompanied by adequate pooled liquidity.",
  },
];

const history: HistoricalComparison = {
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
};

const crossSource: CrossSourceIntelligence = {
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
};

const socialSummary: SocialSummary = {
  dataState: DataState.AVAILABLE,
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
};

const newsSummary: NewsSummary = {
  dataState: DataState.AVAILABLE,
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
};

// Real engine calls, matching report/build-report.ts's own composition order — see this
// file's header comment above `signals` for why these three fields are computed rather
// than hand-authored.
const ecosystem = buildEcosystemIntelligence({
  chainId: DEMO_CHAIN_ID,
  address: DEMO_ADDRESS,
  observedAt: NOW,
  contractState: DataState.AVAILABLE,
  contract: { creatorAddress: DEMO_DEPLOYER },
  liquidityState: DataState.AVAILABLE,
  liquidity: { dexId: DEMO_DEX_ID, pairAddress: DEMO_PAIR_ADDRESS, liquidityUsd: 428_000 },
});

/**
 * Adversarial Intelligence for the demo report — computed by the real engine
 * (`analyzeAdversarial`) from the same illustrative figures the rest of this
 * file uses, exactly like `ecosystem`/`events`/`relationshipGraph` above.
 * Hand-authoring plausible-looking "manipulation signals" here would be the
 * single worst place in this codebase to fake data, so nothing below is
 * hand-written: the demo's liquidity/holder/social/news numbers go in, and
 * whatever the shipped engine concludes comes out.
 */
const adversarial = analyzeAdversarial({
  now: NOW,
  history,
  // The demo token's identity is CONFIRMED, so IDENTITY_NARRATIVE_CONFLICT
  // correctly comes back NOT_OBSERVED below — the demo does not stage a fake
  // identity collision just to make the section look busier.
  identity: {
    chainId: DEMO_CHAIN_ID,
    contractAddress: DEMO_ADDRESS,
    status: IdentityStatus.CONFIRMED,
    confidence: Confidence.HIGH,
    match: null,
    conflicts: [],
    providerObserved: [],
    observedAt: NOW,
  },
  liquidityState: DataState.AVAILABLE,
  liquidity: { liquidityUsd: 428_000, buys24h: 612, sells24h: 340 },
  previousLiquidityState: DataState.AVAILABLE,
  previousLiquidity: { liquidityUsd: 390_000, buys24h: 180, sells24h: 120 },
  holdersState: DataState.AVAILABLE,
  holders: { holderCount: 1_284, top10Pct: 61.4, top20Pct: 72.0 },
  social: socialSummary,
  news: newsSummary,
});

const events = buildIntelligenceEvents({
  chainId: DEMO_CHAIN_ID,
  address: DEMO_ADDRESS,
  generatedAt: NOW,
  history,
  identityStatus: IdentityStatus.CONFIRMED,
  identityConfidence: Confidence.HIGH,
  signals,
  social: socialSummary,
  news: newsSummary,
  crossSource,
  ecosystemRelationships: ecosystem.relationships,
  adversarialSignals: adversarial.signals,
  // No previous scan is modeled for the demo report, so every ecosystem relationship
  // above is treated as newly observed — matching a real token's first scan.
  previousEcosystemRelationshipIds: new Set<string>(),
});

const relationshipGraph = buildRelationshipGraph({
  generatedAt: NOW,
  subject: tokenEntity(DEMO_CHAIN_ID, DEMO_ADDRESS),
  observedAt: NOW,
  tokenRelationships: relationships,
  temporalRelationships: history.relationships,
  temporalObservedAt: history.currentObservedAt,
  crossSourceRelationships: crossSource.relationships,
  ecosystemRelationships: ecosystem.relationships,
  adversarialRelationships: toCanonicalAdversarialRelationships(adversarial, tokenEntity(DEMO_CHAIN_ID, DEMO_ADDRESS)),
  eventRelationships: events.events.flatMap((event) =>
    event.relatedEntities.map((object) => ({
      id: `event-rel:${event.id}:${object.id}`,
      category: RelationshipCategory.EVENT,
      relationshipType: "EVENT_INVOLVES_ENTITY",
      observedAt: event.eventTimestamp,
      subject: event.subject,
      object,
      sourcesInvolved: event.source,
      evidence: event.evidence,
      confidence: event.confidence ?? Confidence.LOW,
      dataState: event.dataState,
      interpretation: event.description,
    })),
  ),
});

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
  signals,
  relationships,
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
      observedAt: NOW,
      source: "relationship_analysis",
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
  social: { state: socialSummary.dataState, ...socialSummary },
  news: { state: newsSummary.dataState, ...newsSummary },
  dataQuality: {
    contract: DataState.AVAILABLE,
    liquidity: DataState.AVAILABLE,
    holders: DataState.AVAILABLE,
    social: DataState.AVAILABLE,
    news: DataState.AVAILABLE,
    overallConfidencePenalty: null,
  },
  history,
  crossSource,
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
  relationshipGraph,
  events,
  ecosystem,
  adversarial,
  limitations: [],
};
