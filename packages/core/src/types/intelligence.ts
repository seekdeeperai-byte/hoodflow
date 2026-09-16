/**
 * Signal / Relationship / Evidence / Interpretation types.
 * See docs/INTELLIGENCE_ENGINE.md for the semantics of each field.
 */

export const SignalType = {
  // Contract
  OWNERSHIP_RISK: "OWNERSHIP_RISK",
  PROXY_RISK: "PROXY_RISK",
  UPGRADEABILITY_RISK: "UPGRADEABILITY_RISK",
  BLACKLIST_CAPABILITY: "BLACKLIST_CAPABILITY",
  PAUSE_CAPABILITY: "PAUSE_CAPABILITY",
  MINT_CAPABILITY: "MINT_CAPABILITY",
  FEE_RISK: "FEE_RISK",
  TRANSFER_RESTRICTION: "TRANSFER_RESTRICTION",
  MAX_WALLET_RESTRICTION: "MAX_WALLET_RESTRICTION",
  MAX_TX_RESTRICTION: "MAX_TX_RESTRICTION",
  HONEYPOT_RISK: "HONEYPOT_RISK",

  // Liquidity
  LIQUIDITY_STRENGTH: "LIQUIDITY_STRENGTH",
  LIQUIDITY_GROWTH: "LIQUIDITY_GROWTH",
  LIQUIDITY_DECLINE: "LIQUIDITY_DECLINE",
  MC_LIQUIDITY_DIVERGENCE: "MC_LIQUIDITY_DIVERGENCE",
  VOLUME_LIQUIDITY_DIVERGENCE: "VOLUME_LIQUIDITY_DIVERGENCE",

  // Holders
  HOLDER_CONCENTRATION: "HOLDER_CONCENTRATION",
  TOP10_CONCENTRATION: "TOP10_CONCENTRATION",
  TOP20_CONCENTRATION: "TOP20_CONCENTRATION",
  HOLDER_GROWTH: "HOLDER_GROWTH",

  // Market/flow
  BUY_SELL_IMBALANCE: "BUY_SELL_IMBALANCE",
  PRICE_MOMENTUM: "PRICE_MOMENTUM",

  // Historical (Phase 6) — see packages/core/src/historical/historical-signals.ts.
  // Appended to the report's signals array AFTER the market Relationship/Evidence/
  // marketState sweep, same placement as identity signals: informational, never an
  // input to marketState or score.dataQualityScore (docs/HISTORICAL_INTELLIGENCE.md).
  // LIQUIDITY_GROWTH/LIQUIDITY_DECLINE above were typed since Phase 0 for exactly this
  // ("activate once the HistoryStore has at least two snapshots") and are activated —
  // not newly added — this phase. HOLDER_GROWTH above is likewise reused as-is
  // (analyzers/holders-analyzer.ts, unchanged). Only the two concentration-trend types
  // below are genuinely new: TOP10_CONCENTRATION/TOP20_CONCENTRATION already cover "how
  // concentrated right now"; nothing covered "is concentration changing" before Phase 6.
  HOLDER_CONCENTRATION_INCREASE: "HOLDER_CONCENTRATION_INCREASE",
  HOLDER_CONCENTRATION_DECREASE: "HOLDER_CONCENTRATION_DECREASE",

  // Identity (Phase 5) — see packages/core/src/analyzers/identity-analyzer.ts.
  // Deliberately kept out of detectRelationships()/buildEvidence()'s market-signal
  // contradiction sweep: identity risk is conceptually separate from contract/market
  // risk (docs/IDENTITY_RESOLUTION.md).
  IDENTITY_CONFIRMED: "IDENTITY_CONFIRMED",
  IDENTITY_AMBIGUITY: "IDENTITY_AMBIGUITY",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  IDENTITY_UNVERIFIED: "IDENTITY_UNVERIFIED",
  IDENTITY_COLLISION: "IDENTITY_COLLISION",
  OFFICIAL_IDENTITY_MATCH: "OFFICIAL_IDENTITY_MATCH",
  NON_OFFICIAL_IDENTITY_CONTEXT: "NON_OFFICIAL_IDENTITY_CONTEXT",

  // Social + News + Attention (Final Intelligence Completion phase) — see
  // packages/core/src/social/social-analyzer.ts, news/news-analyzer.ts, and
  // attention/attention-engine.ts. Deliberately NEUTRAL-direction by default
  // (see analyzeSocial/analyzeNews/analyzeAttention doc comments): "more
  // attention" is an observation, not a risk judgment, so these never carry
  // the same POSITIVE/NEGATIVE risk-valence semantics as e.g. HOLDER_GROWTH.
  SOCIAL_ATTENTION_LEVEL: "SOCIAL_ATTENTION_LEVEL",
  SOCIAL_ATTENTION_ACCELERATION: "SOCIAL_ATTENTION_ACCELERATION",
  NEWS_COVERAGE_LEVEL: "NEWS_COVERAGE_LEVEL",
  NEWS_COVERAGE_ACCELERATION: "NEWS_COVERAGE_ACCELERATION",
  ATTENTION_STATE_CHANGE: "ATTENTION_STATE_CHANGE",
} as const;
export type SignalType = (typeof SignalType)[keyof typeof SignalType];

export const Direction = { POSITIVE: "POSITIVE", NEGATIVE: "NEGATIVE", NEUTRAL: "NEUTRAL" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const Strength = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" } as const;
export type Strength = (typeof Strength)[keyof typeof Strength];

export const Confidence = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" } as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];

export interface Signal {
  signalType: SignalType;
  direction: Direction;
  strength: Strength;
  confidence: Confidence;
  source: string; // e.g. "contract", "liquidity"
  evidence: string; // one factual sentence, no verdicts
  timestamp: string;
}

export const RelationshipType = {
  DEMAND_EXPANSION: "DEMAND_EXPANSION",
  SPECULATIVE_OVERHEATING: "SPECULATIVE_OVERHEATING",
  COOLING: "COOLING",
  LIQUIDITY_LAGGING_ACTIVITY: "LIQUIDITY_LAGGING_ACTIVITY",
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

export interface Relationship {
  relationshipType: RelationshipType;
  confidence: Confidence;
  supportingSignals: SignalType[];
  contradictingSignals: SignalType[];
  evidence: string[];
  interpretation: string;
}

export const MarketState = {
  HEALTHY_FLOW: "HEALTHY_FLOW",
  DEMAND_EXPANSION: "DEMAND_EXPANSION",
  ACCUMULATION: "ACCUMULATION",
  SPECULATIVE: "SPECULATIVE",
  OVERHEATED: "OVERHEATED",
  COOLING: "COOLING",
  DISTRIBUTION: "DISTRIBUTION",
  LIQUIDITY_STRESS: "LIQUIDITY_STRESS",
  CONTRACT_RISK: "CONTRACT_RISK",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
} as const;
export type MarketState = (typeof MarketState)[keyof typeof MarketState];

export const HypeState = {
  QUIET: "QUIET",
  EMERGING: "EMERGING",
  ACCELERATING: "ACCELERATING",
  HIGH_ATTENTION: "HIGH_ATTENTION",
  EXTREME_ATTENTION: "EXTREME_ATTENTION",
  COOLING: "COOLING",
  UNKNOWN: "UNKNOWN",
} as const;
export type HypeState = (typeof HypeState)[keyof typeof HypeState];

export interface EvidenceItem {
  claim: string;
  supportingMetrics: string[];
  contradictingMetrics: string[];
  confidence: Confidence;
}

export interface Interpretation {
  headline: string;
  summary: string;
  supportingMetrics: string[];
  supportingSignals: SignalType[];
  contradictingSignals: SignalType[];
  confidence: Confidence;
  limitations: string[];
  whatWouldChangeAssessment: string[];
}

export interface DataQuality {
  contract: import("./data-state.js").DataState;
  liquidity: import("./data-state.js").DataState;
  holders: import("./data-state.js").DataState;
  social: import("./data-state.js").DataState;
  news: import("./data-state.js").DataState;
  overallConfidencePenalty: Confidence | null;
}

export interface HoodflowReport {
  token: import("./domain.js").TokenIdentity;
  generatedAt: string;
  /** OBSERVATION_TIME vs FETCH_TIME/SERVE_TIME — see packages/core/src/freshness.ts. */
  dataFreshness: import("../freshness.js").DataFreshnessInfo;
  /**
   * "What exact asset are we analyzing?" — resolved deterministically from
   * chain + contract address against the known-token registry, with
   * provider-observed name/symbol as contextual (never authoritative)
   * evidence. See docs/IDENTITY_RESOLUTION.md. Informational: never an
   * input to `score.dataQualityScore` or `marketState` (Phase 5 §5/§24).
   */
  identity: import("./identity.js").IdentityResolution;
  score: {
    /** Data-completeness / confidence composite, NOT a buy/sell score. 0-100. */
    dataQualityScore: number;
  };
  marketState: {
    state: MarketState;
    confidence: Confidence;
  };
  signals: Signal[];
  relationships: Relationship[];
  interpretations: Interpretation[];
  /**
   * Attention/Hype (Final Intelligence Completion phase §5). Reuses the
   * pre-existing `HypeState` enum for `state` — see
   * packages/core/src/attention/attention-engine.ts for the exact,
   * documented, reproducible formula and docs/HYPE_ATTENTION.md for the
   * HypeState<->spec-suggested-AttentionState mapping. `components` and
   * `reasoning` are additive (never present in the pre-Phase-12 stub value,
   * so existing consumers that only read `score`/`state`/`quality`/
   * `confirmation` are unaffected).
   */
  hype: {
    score: number | null;
    state: HypeState;
    quality: "UNKNOWN" | Confidence;
    confirmation: "UNKNOWN" | Confidence;
    /** Exposed formula inputs — see attention-engine.ts. Empty/absent fields mean that input was unavailable, never 0. */
    components?: import("./social-news.js").AttentionComponents;
    /** Plain-language, non-causal explanation of how `state` was reached. */
    reasoning?: string[];
  };
  /**
   * Social intelligence (Final Intelligence Completion phase §3). `state`
   * is preserved exactly as it was in every prior build (a bare
   * `{ state: DataState }`, always DATA_UNAVAILABLE) for backward
   * compatibility; the additional fields below are new and additive — see
   * packages/core/src/social/social-analyzer.ts and types/social-news.ts's
   * `SocialSummary`, which this type structurally mirrors minus the
   * `dataState`/`state` naming.
   */
  social: { state: import("./data-state.js").DataState } & Omit<import("./social-news.js").SocialSummary, "dataState">;
  /** News intelligence (§4) — see news/news-analyzer.ts and types/social-news.ts's `NewsSummary`. */
  news: { state: import("./data-state.js").DataState } & Omit<import("./social-news.js").NewsSummary, "dataState">;
  dataQuality: DataQuality;
  /**
   * "What changed since the last observation?" (Phase 6) — deltas, trends,
   * and temporal relationships built from this scan plus, at most, the
   * single immediately-previous scan of this exact token (chain +
   * normalized address) via the existing HistoryStore. `status` is
   * INSUFFICIENT_HISTORY, never a fabricated baseline, when no previous
   * scan exists yet. Informational: never an input to `score.dataQualityScore`
   * or `marketState` (docs/HISTORICAL_INTELLIGENCE.md "Score integrity").
   */
  history: import("./history.js").HistoricalComparison;
  /**
   * Cross-Source Intelligence (§6-9) — on-chain + historical + social + news
   * + attention relationships. A new, additive top-level field (not a
   * replacement of `relationships`, which stays scoped to same-snapshot
   * on-chain Signals). See types/cross-source.ts and
   * cross-source/cross-source-engine.ts.
   */
  crossSource: import("./cross-source.js").CrossSourceIntelligence;
  /**
   * Final synthesis layer (§12-13): WHAT CHANGED / cross-source
   * interpretation / WHAT TO MONITOR, spanning every domain above. Additive;
   * never a trade recommendation. See types/cross-source.ts.
   */
  integratedInterpretation: import("./cross-source.js").IntegratedInterpretation;
  /**
   * Canonical Relationship Model (FINAL GAP CLOSURE phase — architecture
   * correction). ADDITIVE — `relationships` (TOKEN category) and
   * `history.relationships` (TEMPORAL category) above are UNCHANGED in
   * shape and behavior; this is every relationship this report produced
   * (TOKEN + TEMPORAL + CROSS_SOURCE + ECOSYSTEM + EVENT), re-expressed in
   * one shared envelope. See types/relationship-graph.ts and
   * relationships/canonical.ts.
   */
  relationshipGraph: import("./relationship-graph.js").RelationshipGraph;
  /**
   * Intelligence Events (FINAL GAP CLOSURE phase §4) — "what changed?" as a
   * first-class, typed, deterministic feed derived from data already
   * present elsewhere on this report. See types/events.ts and
   * events/event-engine.ts.
   */
  events: import("./events.js").IntelligenceEventFeed;
  /**
   * Ecosystem Intelligence (FINAL GAP CLOSURE phase §5) — "what is connected
   * to this token?" See types/ecosystem.ts and ecosystem/ecosystem-engine.ts.
   */
  ecosystem: import("./ecosystem.js").EcosystemIntelligence;
  limitations: string[];
}
