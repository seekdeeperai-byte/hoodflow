import { Direction, type EvidenceItem, type Interpretation, type Relationship, type Signal, Strength } from "../types/intelligence.js";

/**
 * LLM-free by default: turns relationships + evidence into readable
 * interpretations via deterministic templates. An LLMRewriter can be
 * plugged in later purely for prose polish (see LLMRewriter below) but it
 * NEVER supplies facts, numbers, confidence, or state — those are fixed
 * before this function is ever called. If the rewriter fails or is absent,
 * these templates are the interpretation, not a fallback of last resort.
 */
export interface LLMRewriter {
  rewrite(headline: string, summary: string): Promise<{ headline: string; summary: string } | null>;
}

const HEADLINES: Record<string, string> = {
  DEMAND_EXPANSION: "Demand is broadening",
  LIQUIDITY_LAGGING_ACTIVITY: "Liquidity is lagging activity",
  SPECULATIVE_OVERHEATING: "Pattern resembles speculative overheating",
  COOLING: "Momentum is weakening",
};

export function buildInterpretations(relationships: Relationship[], evidence: EvidenceItem[], observedAt: string): Interpretation[] {
  return relationships.map((rel, i) => {
    const ev = evidence[i];
    return {
      headline: HEADLINES[rel.relationshipType] ?? rel.relationshipType,
      summary: rel.interpretation,
      supportingMetrics: ev?.supportingMetrics ?? rel.evidence,
      supportingSignals: rel.supportingSignals,
      contradictingSignals: rel.contradictingSignals,
      confidence: ev?.confidence ?? rel.confidence,
      limitations: [],
      whatWouldChangeAssessment: whatWouldChange(rel),
      observedAt,
      source: "relationship_analysis",
    } satisfies Interpretation;
  });
}

function whatWouldChange(rel: Relationship): string[] {
  switch (rel.relationshipType) {
    case "LIQUIDITY_LAGGING_ACTIVITY":
      return ["Pooled liquidity growing in proportion to market cap or volume would ease this concern."];
    case "DEMAND_EXPANSION":
      return ["A drop in buy/sell ratio or liquidity failing to keep pace would weaken this read."];
    case "SPECULATIVE_OVERHEATING":
      return ["Broader holder distribution or liquidity catching up to activity would reduce overheating risk."];
    case "COOLING":
      return ["A rebound in buy pressure or renewed volume would contradict this read."];
    default:
      return [];
  }
}

/** Standalone interpretation for high-severity contract signals that aren't part of a market relationship. */
export function buildContractInterpretation(signals: Signal[], observedAt: string): Interpretation | null {
  const risky = signals.filter((s) => s.source === "contract" && s.direction === Direction.NEGATIVE);
  if (risky.length === 0) return null;
  const highCount = risky.filter((s) => s.strength === Strength.HIGH).length;
  return {
    headline: highCount > 0 ? "Contract carries elevated risk indicators" : "Contract has minor risk indicators",
    summary:
      "The following contract-level capabilities were observed. Their presence does not by itself mean the " +
      "token is unsafe, but each expands what the contract owner or a compromised key can do.",
    supportingMetrics: risky.map((s) => s.evidence),
    supportingSignals: risky.map((s) => s.signalType),
    contradictingSignals: [],
    confidence: "HIGH",
    limitations: [],
    whatWouldChangeAssessment: ["Ownership renounced, or the risky capability removed via a verified upgrade."],
    observedAt,
    source: "contract_risk_analysis",
  };
}
