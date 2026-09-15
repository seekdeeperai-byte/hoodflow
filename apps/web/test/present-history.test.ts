import { describe, expect, it } from "vitest";
import type { MetricDelta, Trend } from "@hoodflow/core";
import { presentDelta, presentTrend, summarizeWhatChanged } from "../lib/present-history";

function delta(overrides: Partial<MetricDelta>): MetricDelta {
  return {
    metric: "liquidityUsd",
    status: "UNCHANGED",
    previousValue: 100,
    currentValue: 100,
    previousObservedAt: "2026-01-01T00:00:00.000Z",
    currentObservedAt: "2026-01-02T00:00:00.000Z",
    absoluteChange: 0,
    percentChange: 0,
    percentagePointChange: null,
    confidence: "MEDIUM",
    ...overrides,
  };
}

describe("presentDelta", () => {
  it("never fabricates a value for INSUFFICIENT_HISTORY — direction is unavailable, changeText is null", () => {
    const p = presentDelta(delta({ status: "INSUFFICIENT_HISTORY", previousValue: null, absoluteChange: null, percentChange: null }));
    expect(p.direction).toBe("unavailable");
    expect(p.changeText).toBeNull();
    expect(p.unavailableReason).toContain("no prior scan");
  });

  it("never treats UNAVAILABLE as zero — surfaces the backend's note when present", () => {
    const p = presentDelta(delta({ status: "UNAVAILABLE", note: "Liquidity data was unavailable in the previous scan." }));
    expect(p.direction).toBe("unavailable");
    expect(p.changeText).toBeNull();
    expect(p.unavailableReason).toBe("Liquidity data was unavailable in the previous scan.");
  });

  it("renders UNCHANGED as flat with no numeric claim", () => {
    const p = presentDelta(delta({ status: "UNCHANGED" }));
    expect(p.direction).toBe("flat");
    expect(p.changeText).toBe("No significant change");
  });

  it("renders an INCREASED USD metric with both absolute and percent change", () => {
    const p = presentDelta(
      delta({ metric: "liquidityUsd", status: "INCREASED", previousValue: 390_000, currentValue: 428_000, absoluteChange: 38_000, percentChange: 9.74 }),
    );
    expect(p.direction).toBe("up");
    expect(p.changeText).toBe("+$38.0K (+9.7%)");
  });

  it("renders a DECREASED count metric using signed-count formatting, not USD", () => {
    const p = presentDelta(
      delta({ metric: "holderCount", status: "DECREASED", previousValue: 2610, currentValue: 2500, absoluteChange: -110, percentChange: -4.21 }),
    );
    expect(p.direction).toBe("down");
    expect(p.changeText).toBe("-110 (-4.2%)");
  });

  it("renders a percentage-point metric (e.g. top10Pct) in pp, not USD or count", () => {
    const p = presentDelta(
      delta({ metric: "top10Pct", status: "INCREASED", previousValue: 39, currentValue: 42, absoluteChange: 3, percentChange: null, percentagePointChange: 3 }),
    );
    expect(p.changeText).toBe("+3.0pp");
  });
});

describe("presentTrend", () => {
  it("maps a known trend type to display copy", () => {
    const trend: Trend = { metric: "liquidityUsd", trendType: "LIQUIDITY_INCREASING", direction: "INCREASING", confidence: "MEDIUM" };
    expect(presentTrend(trend)).toBe("Liquidity increasing");
  });

  it("falls back to the raw trend type for anything unmapped", () => {
    const trend = { metric: "x", trendType: "SOMETHING_NEW", direction: "INCREASING", confidence: "MEDIUM" } as unknown as Trend;
    expect(presentTrend(trend)).toBe("SOMETHING_NEW");
  });
});

describe("summarizeWhatChanged", () => {
  it("only includes deltas that actually changed — never a placeholder for INSUFFICIENT_HISTORY/UNAVAILABLE/UNCHANGED", () => {
    const comparisons: MetricDelta[] = [
      delta({ metric: "liquidityUsd", status: "INCREASED", absoluteChange: 38_000, percentChange: 9.74, previousValue: 390_000, currentValue: 428_000 }),
      delta({ metric: "holderCount", status: "UNCHANGED" }),
      delta({ metric: "top10Pct", status: "INSUFFICIENT_HISTORY", previousValue: null, absoluteChange: null, percentChange: null }),
    ];
    const summary = summarizeWhatChanged(comparisons);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain("Liquidity");
  });

  it("returns an empty array, not a fabricated line, when nothing changed", () => {
    const comparisons: MetricDelta[] = [delta({ status: "UNCHANGED" })];
    expect(summarizeWhatChanged(comparisons)).toEqual([]);
  });
});
