import type { TokenSnapshot } from "../types/domain.js";
import { HistoryStatus, type HistoricalComparison } from "../types/history.js";
import { computeComparisons } from "./delta-engine.js";
import { computeTrends } from "./trend-engine.js";
import { detectTemporalRelationships } from "./temporal-relationship-engine.js";

/**
 * Orchestrates the Phase 6 historical pipeline: comparisons -> trends ->
 * temporal relationships. Pure, no I/O — mirrors report/build-report.ts's
 * own composition style. The caller (report/build-report.ts) is
 * responsible for supplying only the current snapshot plus, at most, the
 * single immediately-previous snapshot for this exact token (chain +
 * normalized address) — this function never looks at more than those two,
 * so it is O(1) in the number of metrics compared, never O(history) or
 * O(all tokens). See docs/HISTORICAL_INTELLIGENCE.md "Performance."
 */
export function buildHistoricalComparison(current: TokenSnapshot, previous: TokenSnapshot | undefined): HistoricalComparison {
  const comparisons = computeComparisons(current, previous);
  const trends = previous !== undefined ? computeTrends(comparisons) : [];
  const relationships = previous !== undefined ? detectTemporalRelationships(trends) : [];

  return {
    status: previous !== undefined ? HistoryStatus.COMPARABLE : HistoryStatus.INSUFFICIENT_HISTORY,
    observationsUsed: previous !== undefined ? 2 : 1,
    currentObservedAt: current.capturedAt,
    previousObservedAt: previous?.capturedAt ?? null,
    comparisons,
    trends,
    relationships,
  };
}
