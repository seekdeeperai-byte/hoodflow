import { DataState } from "../types/data-state.js";
import { Direction, type HoodflowReport, type Signal } from "../types/intelligence.js";
import { DeltaStatus, type HistoricalComparison } from "../types/history.js";
import { CrossSourceRelationshipType, type CrossSourceIntelligence, type IntegratedInterpretation } from "../types/cross-source.js";

const DIVERGENCE_TYPES = new Set<string>([
  CrossSourceRelationshipType.ONCHAIN_SOCIAL_DIVERGENCE,
  CrossSourceRelationshipType.ATTENTION_LIQUIDITY_DIVERGENCE,
  CrossSourceRelationshipType.MULTI_SOURCE_DIVERGENCE,
]);

/**
 * Final synthesis layer (§12-13): WHAT CHANGED / cross-source interpretation
 * / WHAT TO MONITOR, spanning on-chain + historical + social + news +
 * attention + cross-source. Pure, no I/O, and never a trade recommendation
 * — it only restates real MetricDelta/Signal/CrossSourceRelationship
 * content already computed elsewhere in this pipeline; it does not compute
 * any new number, threshold, or prediction of its own.
 */
export function buildIntegratedInterpretation(input: {
  history: HistoricalComparison;
  social: HoodflowReport["social"];
  news: HoodflowReport["news"];
  hype: HoodflowReport["hype"];
  crossSource: CrossSourceIntelligence;
  signals: Signal[];
  limitations: string[];
}): IntegratedInterpretation {
  const { history, social, news, hype, crossSource, signals, limitations } = input;
  const whatChanged: string[] = [];

  for (const delta of history.comparisons) {
    if (delta.status === DeltaStatus.INCREASED || delta.status === DeltaStatus.DECREASED) {
      const dir = delta.status === DeltaStatus.INCREASED ? "increased" : "decreased";
      const amount =
        delta.percentChange !== null
          ? `${delta.percentChange >= 0 ? "+" : ""}${delta.percentChange.toFixed(1)}%`
          : delta.percentagePointChange !== null
            ? `${delta.percentagePointChange >= 0 ? "+" : ""}${delta.percentagePointChange.toFixed(1)}pp`
            : "";
      whatChanged.push(`On-chain: ${delta.metric} ${dir} from ${delta.previousValue} to ${delta.currentValue}${amount ? ` (${amount})` : ""}.`);
    }
  }

  if (social.state !== DataState.DATA_UNAVAILABLE && social.state !== DataState.PROVIDER_UNAVAILABLE) {
    if (social.postCount !== undefined) {
      whatChanged.push(
        `Social: ${social.postCount} matching post(s) observed${social.mentionVelocity !== undefined ? ` (${social.mentionVelocity.toFixed(2)}/hr)` : ""}${
          social.mentionVelocityChange !== undefined
            ? `, ${social.mentionVelocityChange >= 0 ? "up" : "down"} from the previous scan`
            : ""
        }.`,
      );
    }
  }

  if (news.state !== DataState.DATA_UNAVAILABLE && news.state !== DataState.PROVIDER_UNAVAILABLE) {
    if (news.storyCount !== undefined) {
      whatChanged.push(`News: ${news.storyCount} distinct stor${news.storyCount === 1 ? "y" : "ies"} observed this scan.`);
    }
  }

  if (hype.state !== "UNKNOWN") {
    whatChanged.push(`Attention: classified ${hype.state} this scan${hype.score !== null ? ` (score ${hype.score}/100)` : ""}.`);
  }

  const realRelationships = crossSource.relationships.filter(
    (r) => r.relationshipType !== CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA,
  );
  const crossSourceSummary =
    realRelationships.length > 0 ? realRelationships.map((r) => r.interpretation).join(" ") : null;

  const whatToMonitor: string[] = [];
  for (const signal of signals) {
    if (signal.direction === Direction.NEGATIVE) {
      whatToMonitor.push(`Potential concern: ${signal.evidence}`);
    }
  }
  for (const rel of crossSource.relationships) {
    if (DIVERGENCE_TYPES.has(rel.relationshipType)) {
      whatToMonitor.push(`Watch for: ${rel.interpretation}`);
    }
  }
  if (crossSource.relationships.some((r) => r.relationshipType === CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA)) {
    whatToMonitor.push(
      "Monitor: cross-source intelligence could not be computed this scan — see the cross-source section's limitations for exactly which domain(s) were unavailable.",
    );
  }

  const dataState =
    whatChanged.length > 0 || crossSourceSummary !== null
      ? DataState.AVAILABLE
      : limitations.length > 0
        ? DataState.PARTIAL
        : DataState.DATA_UNAVAILABLE;

  return { dataState, whatChanged, crossSourceSummary, whatToMonitor, limitations: [...crossSource.limitations] };
}
