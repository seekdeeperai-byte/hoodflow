import type { MetricDelta, Trend } from "@hoodflow/core";
import { formatPct, formatPp, formatSignedCount, formatSignedUsd, metricLabel } from "./format";

/**
 * Turns one backend-computed MetricDelta into display copy. This is
 * presentation only: it never computes a delta, a percentage, a threshold,
 * or a status — every one of those already came from
 * packages/core/src/historical/delta-engine.ts. This function only decides
 * how to *word* a status that already exists, which is why it's a plain,
 * fully unit-testable function of its input and nothing else (no fetch, no
 * state, no side effects).
 */
export interface DeltaPresentation {
  metric: string;
  label: string;
  direction: "up" | "down" | "flat" | "unavailable";
  /** e.g. "+$38.0K", "+9.7%" — only set when the delta is a real, comparable number. */
  changeText: string | null;
  /** Human explanation shown instead of a number when the delta cannot be shown as a value. */
  unavailableReason: string | null;
}

export function presentDelta(delta: MetricDelta): DeltaPresentation {
  const label = metricLabel(delta.metric);
  const isPercentageMetric = delta.percentagePointChange !== null || delta.metric.toLowerCase().includes("pct");

  switch (delta.status) {
    case "INSUFFICIENT_HISTORY":
      return {
        metric: delta.metric,
        label,
        direction: "unavailable",
        changeText: null,
        unavailableReason: `${label} has no prior scan to compare against yet — this is unmeasured, not unchanged.`,
      };
    case "UNAVAILABLE":
      return {
        metric: delta.metric,
        label,
        direction: "unavailable",
        changeText: null,
        unavailableReason: delta.note ?? `${label} was unavailable in the previous and/or current scan — a change cannot be calculated.`,
      };
    case "NOT_COMPARABLE":
      return {
        metric: delta.metric,
        label,
        direction: "unavailable",
        changeText: null,
        unavailableReason: delta.note ?? `${label} could not be compared between scans.`,
      };
    case "UNCHANGED":
      return { metric: delta.metric, label, direction: "flat", changeText: "No significant change", unavailableReason: null };
    case "INCREASED":
    case "DECREASED": {
      const direction = delta.status === "INCREASED" ? "up" : "down";
      const parts: string[] = [];
      if (delta.absoluteChange !== null) {
        parts.push(isPercentageMetric ? formatPp(delta.absoluteChange) : formatMagnitude(delta.metric, delta.absoluteChange));
      }
      if (delta.percentChange !== null) parts.push(formatPct(delta.percentChange));
      return {
        metric: delta.metric,
        label,
        direction,
        changeText: parts.length > 0 ? parts.join(" (") + (parts.length > 1 ? ")" : "") : null,
        unavailableReason: null,
      };
    }
    default:
      return { metric: delta.metric, label, direction: "unavailable", changeText: null, unavailableReason: "Unrecognized comparison status." };
  }
}

function formatMagnitude(metric: string, absoluteChange: number): string {
  if (metric.toLowerCase().includes("usd")) return formatSignedUsd(absoluteChange);
  return formatSignedCount(absoluteChange);
}

const TREND_COPY: Record<string, string> = {
  LIQUIDITY_INCREASING: "Liquidity increasing",
  LIQUIDITY_DECREASING: "Liquidity decreasing",
  HOLDER_COUNT_INCREASING: "Holder count increasing",
  HOLDER_COUNT_DECREASING: "Holder count decreasing",
  CONCENTRATION_INCREASING: "Concentration increasing",
  CONCENTRATION_DECREASING: "Concentration decreasing",
  NO_TREND: "No significant change",
};

export function presentTrend(trend: Trend): string {
  return TREND_COPY[trend.trendType] ?? trend.trendType;
}

/**
 * A one-line summary of "what changed" for the compact headline component,
 * built only from real, already-INCREASED/DECREASED deltas — a token with
 * no comparable deltas correctly produces an empty array, never a
 * fabricated placeholder line.
 */
export function summarizeWhatChanged(comparisons: MetricDelta[]): string[] {
  return comparisons
    .filter((d) => d.status === "INCREASED" || d.status === "DECREASED")
    .map((d) => {
      const p = presentDelta(d);
      return `${p.label} ${p.changeText ?? ""}`.trim();
    });
}
