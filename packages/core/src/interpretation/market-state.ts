import { Confidence, Direction, MarketState, type Relationship, type Signal, SignalType, Strength } from "../types/intelligence.js";

const HIGH_RISK_CONTRACT_SIGNALS: SignalType[] = [
  SignalType.HONEYPOT_RISK,
  SignalType.MINT_CAPABILITY,
  SignalType.PAUSE_CAPABILITY,
  SignalType.BLACKLIST_CAPABILITY,
];

function hasRel(relationships: Relationship[], type: string): Relationship | undefined {
  return relationships.find((r) => r.relationshipType === type);
}

/**
 * Deterministic market-state selection. Never invents a state when the
 * evidence is thin — INSUFFICIENT_DATA is a first-class, expected outcome.
 */
export function selectMarketState(
  signals: Signal[],
  relationships: Relationship[],
): { state: MarketState; confidence: Confidence } {
  if (signals.length === 0) {
    return { state: MarketState.INSUFFICIENT_DATA, confidence: Confidence.LOW };
  }

  const contractRisk = signals.find(
    (s) => HIGH_RISK_CONTRACT_SIGNALS.includes(s.signalType) && s.strength === Strength.HIGH && s.direction === Direction.NEGATIVE,
  );
  if (contractRisk) {
    return { state: MarketState.CONTRACT_RISK, confidence: Confidence.HIGH };
  }

  const liquidityLag = hasRel(relationships, "LIQUIDITY_LAGGING_ACTIVITY");
  const overheating = hasRel(relationships, "SPECULATIVE_OVERHEATING");
  const demandExpansion = hasRel(relationships, "DEMAND_EXPANSION");
  const cooling = hasRel(relationships, "COOLING");

  if (overheating) {
    return { state: MarketState.SPECULATIVE, confidence: overheating.confidence };
  }
  if (liquidityLag && liquidityLag.confidence === Confidence.HIGH) {
    return { state: MarketState.LIQUIDITY_STRESS, confidence: Confidence.HIGH };
  }
  if (demandExpansion && demandExpansion.confidence !== Confidence.LOW) {
    return { state: MarketState.DEMAND_EXPANSION, confidence: demandExpansion.confidence };
  }
  if (cooling) {
    return { state: MarketState.COOLING, confidence: cooling.confidence };
  }

  const liquidityStrength = signals.find((s) => s.signalType === SignalType.LIQUIDITY_STRENGTH);
  if (liquidityStrength?.direction === Direction.POSITIVE && relationships.length === 0) {
    return { state: MarketState.HEALTHY_FLOW, confidence: Confidence.MEDIUM };
  }

  return { state: MarketState.INSUFFICIENT_DATA, confidence: Confidence.LOW };
}
