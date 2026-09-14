import { Confidence, Direction, type Relationship, RelationshipType, type Signal, SignalType } from "../types/intelligence.js";

function find(signals: Signal[], type: SignalType): Signal | undefined {
  return signals.find((s) => s.signalType === type);
}

/**
 * Detects relationships between signals. This is the differentiator called
 * out in the product spec §16 — HOODFLOW does not just list signals, it
 * explains how they combine, and it is required to record contradicting
 * evidence alongside supporting evidence for every relationship it emits.
 */
export function detectRelationships(signals: Signal[]): Relationship[] {
  const relationships: Relationship[] = [];

  const mcDivergence = find(signals, SignalType.MC_LIQUIDITY_DIVERGENCE);
  const volDivergence = find(signals, SignalType.VOLUME_LIQUIDITY_DIVERGENCE);
  const liquidityStrength = find(signals, SignalType.LIQUIDITY_STRENGTH);
  const buySellImbalance = find(signals, SignalType.BUY_SELL_IMBALANCE);
  const top10 = find(signals, SignalType.TOP10_CONCENTRATION);
  const priceMomentum = find(signals, SignalType.PRICE_MOMENTUM);

  // LIQUIDITY_LAGGING_ACTIVITY: activity (mc or volume) is outrunning pooled depth.
  if (mcDivergence || volDivergence) {
    const supporting = [mcDivergence, volDivergence].filter(Boolean).map((s) => s!.signalType);
    const contradicting = liquidityStrength?.direction === Direction.POSITIVE ? [liquidityStrength.signalType] : [];
    relationships.push({
      relationshipType: RelationshipType.LIQUIDITY_LAGGING_ACTIVITY,
      confidence: contradicting.length > 0 ? Confidence.MEDIUM : Confidence.HIGH,
      supportingSignals: supporting,
      contradictingSignals: contradicting,
      evidence: [mcDivergence?.evidence, volDivergence?.evidence].filter(Boolean) as string[],
      interpretation:
        "Market activity is expanding faster than the liquidity backing it. This move is more exposed to " +
        "slippage and concentration risk than headline volume or market cap alone would suggest.",
    });
  }

  // DEMAND_EXPANSION: buying pressure + adequate/growing liquidity, without a liquidity-lag contradiction.
  if (buySellImbalance?.direction === Direction.POSITIVE && liquidityStrength?.direction !== Direction.NEGATIVE) {
    const contradicting = [mcDivergence, volDivergence].filter(Boolean).map((s) => s!.signalType);
    relationships.push({
      relationshipType: RelationshipType.DEMAND_EXPANSION,
      confidence: contradicting.length > 0 ? Confidence.LOW : Confidence.MEDIUM,
      supportingSignals: [buySellImbalance.signalType, ...(liquidityStrength ? [liquidityStrength.signalType] : [])],
      contradictingSignals: contradicting,
      evidence: [buySellImbalance.evidence, liquidityStrength?.evidence].filter(Boolean) as string[],
      interpretation:
        contradicting.length > 0
          ? "Buying pressure is present, but liquidity is not keeping pace — treat demand expansion as tentative."
          : "Demand appears to be broadening: buy pressure is accompanied by adequate pooled liquidity.",
    });
  }

  // SPECULATIVE_OVERHEATING: buy pressure + thin/lagging liquidity + concentrated holders.
  if (
    buySellImbalance?.direction === Direction.POSITIVE &&
    (mcDivergence || volDivergence) &&
    top10?.direction === Direction.NEGATIVE
  ) {
    relationships.push({
      relationshipType: RelationshipType.SPECULATIVE_OVERHEATING,
      confidence: Confidence.MEDIUM,
      supportingSignals: [
        buySellImbalance.signalType,
        ...(mcDivergence ? [mcDivergence.signalType] : []),
        ...(volDivergence ? [volDivergence.signalType] : []),
        top10.signalType,
      ],
      contradictingSignals: [],
      evidence: [buySellImbalance.evidence, mcDivergence?.evidence, volDivergence?.evidence, top10.evidence].filter(
        Boolean,
      ) as string[],
      interpretation:
        "Buy pressure, thin liquidity relative to activity, and concentrated holdings together resemble a " +
        "speculative-overheating pattern rather than broad-based demand.",
    });
  }

  // COOLING: negative price momentum + negative buy/sell imbalance (sellers dominating).
  if (priceMomentum && buySellImbalance?.direction === Direction.NEGATIVE) {
    relationships.push({
      relationshipType: RelationshipType.COOLING,
      confidence: Confidence.MEDIUM,
      supportingSignals: [priceMomentum.signalType, buySellImbalance.signalType],
      contradictingSignals: [],
      evidence: [priceMomentum.evidence, buySellImbalance.evidence],
      interpretation: "Momentum is weakening: sellers are outpacing buyers alongside a notable price move.",
    });
  }

  return relationships;
}
