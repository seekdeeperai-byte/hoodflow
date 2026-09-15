import { DeltaStatus, TrendDirection, TrendType, type MetricDelta, type Trend } from "../types/history.js";
import { Confidence } from "../types/intelligence.js";

const METRIC_TREND_MAP: Record<string, { increasing: TrendType; decreasing: TrendType } | undefined> = {
  liquidityUsd: { increasing: TrendType.LIQUIDITY_INCREASING, decreasing: TrendType.LIQUIDITY_DECREASING },
  holderCount: { increasing: TrendType.HOLDER_COUNT_INCREASING, decreasing: TrendType.HOLDER_COUNT_DECREASING },
  top10Pct: { increasing: TrendType.CONCENTRATION_INCREASING, decreasing: TrendType.CONCENTRATION_DECREASING },
  // top20Pct intentionally has no dedicated trend type — its delta is still reported in
  // `comparisons`, but adding a second concentration trend metric here would duplicate
  // top10Pct's signal without a genuinely distinct interpretation (avoid trend explosion).
};

/**
 * Classifies each comparable delta into a Trend. Only emits a trend when
 * the underlying delta actually supports one:
 * - INCREASED/DECREASED -> the corresponding directional TrendType.
 * - UNCHANGED -> NO_TREND (a real, evidence-backed conclusion: "no
 *   significant change was observed" — not a stand-in for missing data).
 * - INSUFFICIENT_HISTORY / UNAVAILABLE / NOT_COMPARABLE -> no trend entry
 *   at all. Absence of history is never presented as a negative (or
 *   positive) signal — see Phase 6 §11.
 */
export function computeTrends(comparisons: MetricDelta[]): Trend[] {
  const trends: Trend[] = [];
  for (const delta of comparisons) {
    const mapping = METRIC_TREND_MAP[delta.metric];
    if (!mapping) continue;

    if (delta.status === DeltaStatus.INCREASED) {
      trends.push({ metric: delta.metric, trendType: mapping.increasing, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM });
    } else if (delta.status === DeltaStatus.DECREASED) {
      trends.push({ metric: delta.metric, trendType: mapping.decreasing, direction: TrendDirection.DECREASING, confidence: Confidence.MEDIUM });
    } else if (delta.status === DeltaStatus.UNCHANGED) {
      trends.push({ metric: delta.metric, trendType: TrendType.NO_TREND, direction: TrendDirection.UNCHANGED, confidence: Confidence.MEDIUM });
    }
    // INSUFFICIENT_HISTORY / UNAVAILABLE / NOT_COMPARABLE: intentionally no trend entry.
  }
  return trends;
}
