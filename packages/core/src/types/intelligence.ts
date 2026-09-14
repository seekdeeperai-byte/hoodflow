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

  // Market/flow
  BUY_SELL_IMBALANCE: "BUY_SELL_IMBALANCE",
  PRICE_MOMENTUM: "PRICE_MOMENTUM",
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
  hype: {
    score: number | null;
    state: HypeState;
    quality: "UNKNOWN" | Confidence;
    confirmation: "UNKNOWN" | Confidence;
  };
  social: { state: import("./data-state.js").DataState };
  news: { state: import("./data-state.js").DataState };
  dataQuality: DataQuality;
  limitations: string[];
}
