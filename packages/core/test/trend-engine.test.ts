import { describe, expect, it } from "vitest";
import { computeTrends } from "../src/historical/trend-engine.js";
import { DeltaStatus, TrendDirection, TrendType, type MetricDelta } from "../src/types/history.js";

function makeDelta(overrides: Partial<MetricDelta>): MetricDelta {
  return {
    metric: "liquidityUsd",
    status: DeltaStatus.INCREASED,
    previousValue: 100,
    currentValue: 110,
    previousObservedAt: "2026-09-14T00:00:00.000Z",
    currentObservedAt: "2026-09-15T00:00:00.000Z",
    absoluteChange: 10,
    percentChange: 10,
    percentagePointChange: null,
    confidence: "MEDIUM",
    ...overrides,
  };
}

describe("computeTrends", () => {
  it("classifies an INCREASED liquidity delta as LIQUIDITY_INCREASING", () => {
    const trends = computeTrends([makeDelta({ metric: "liquidityUsd", status: DeltaStatus.INCREASED })]);
    expect(trends).toHaveLength(1);
    expect(trends[0]?.trendType).toBe(TrendType.LIQUIDITY_INCREASING);
    expect(trends[0]?.direction).toBe(TrendDirection.INCREASING);
  });

  it("classifies a DECREASED holder count delta as HOLDER_COUNT_DECREASING", () => {
    const trends = computeTrends([makeDelta({ metric: "holderCount", status: DeltaStatus.DECREASED })]);
    expect(trends[0]?.trendType).toBe(TrendType.HOLDER_COUNT_DECREASING);
  });

  it("classifies an INCREASED top10Pct delta as CONCENTRATION_INCREASING", () => {
    const trends = computeTrends([makeDelta({ metric: "top10Pct", status: DeltaStatus.INCREASED })]);
    expect(trends[0]?.trendType).toBe(TrendType.CONCENTRATION_INCREASING);
  });

  it("emits NO_TREND (not silence) for an UNCHANGED comparable delta", () => {
    const trends = computeTrends([makeDelta({ metric: "liquidityUsd", status: DeltaStatus.UNCHANGED })]);
    expect(trends).toHaveLength(1);
    expect(trends[0]?.trendType).toBe(TrendType.NO_TREND);
    expect(trends[0]?.direction).toBe(TrendDirection.UNCHANGED);
  });

  it("emits no trend entry at all for INSUFFICIENT_HISTORY — absence of history is never a negative signal", () => {
    const trends = computeTrends([makeDelta({ metric: "liquidityUsd", status: DeltaStatus.INSUFFICIENT_HISTORY })]);
    expect(trends).toHaveLength(0);
  });

  it("emits no trend entry at all for UNAVAILABLE", () => {
    const trends = computeTrends([makeDelta({ metric: "holderCount", status: DeltaStatus.UNAVAILABLE })]);
    expect(trends).toHaveLength(0);
  });

  it("emits no trend entry at all for NOT_COMPARABLE", () => {
    const trends = computeTrends([makeDelta({ metric: "liquidityUsd", status: DeltaStatus.NOT_COMPARABLE })]);
    expect(trends).toHaveLength(0);
  });

  it("skips metrics with no dedicated trend mapping (top20Pct) without throwing", () => {
    const trends = computeTrends([makeDelta({ metric: "top20Pct", status: DeltaStatus.INCREASED })]);
    expect(trends).toHaveLength(0);
  });

  it("is deterministic: same input always produces the same output", () => {
    const input = [makeDelta({ metric: "liquidityUsd", status: DeltaStatus.INCREASED }), makeDelta({ metric: "holderCount", status: DeltaStatus.DECREASED })];
    expect(computeTrends(input)).toEqual(computeTrends(input));
  });
});
