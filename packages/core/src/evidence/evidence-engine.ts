import { Confidence, Direction, type EvidenceItem, type Relationship, type Signal } from "../types/intelligence.js";

const CONFIDENCE_ORDER: Confidence[] = [Confidence.LOW, Confidence.MEDIUM, Confidence.HIGH];

function downgrade(confidence: Confidence): Confidence {
  const idx = CONFIDENCE_ORDER.indexOf(confidence);
  return CONFIDENCE_ORDER[Math.max(0, idx - 1)]!;
}

/**
 * Builds the final evidence set for a relationship's conclusion. It does a
 * second contradiction sweep across *all* signals (not just the ones the
 * Relationship Engine used to construct the relationship) so a supporting
 * conclusion can't be built by only looking at the signals that agree with
 * it — see product spec §19: "Do not cherry-pick supporting evidence."
 */
export function buildEvidence(relationships: Relationship[], allSignals: Signal[]): EvidenceItem[] {
  return relationships.map((rel) => {
    const alreadyConsidered = new Set([...rel.supportingSignals, ...rel.contradictingSignals]);
    const impliesPositive =
      rel.relationshipType === "DEMAND_EXPANSION";
    const impliesNegative =
      rel.relationshipType === "LIQUIDITY_LAGGING_ACTIVITY" ||
      rel.relationshipType === "SPECULATIVE_OVERHEATING" ||
      rel.relationshipType === "COOLING";

    const extraContradictions = allSignals.filter((s) => {
      if (alreadyConsidered.has(s.signalType)) return false;
      if (impliesPositive && s.direction === Direction.NEGATIVE) return true;
      if (impliesNegative && s.direction === Direction.POSITIVE) return true;
      return false;
    });

    const contradictingMetrics = [...rel.contradictingSignals.map(String), ...extraContradictions.map((s) => s.evidence)];

    const confidence = extraContradictions.length > 0 ? downgrade(rel.confidence) : rel.confidence;

    return {
      claim: rel.interpretation,
      supportingMetrics: rel.evidence,
      contradictingMetrics,
      confidence,
    } satisfies EvidenceItem;
  });
}
