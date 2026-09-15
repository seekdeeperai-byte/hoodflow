import { describe, expect, it } from "vitest";
import { buildHistoricalSignals } from "../src/historical/historical-signals.js";
import { DeltaStatus, type MetricDelta } from "../src/types/history.js";

const NOW = "2026-09-15T00:00:00.000Z";

function makeComparisons(overrides: Partial<Record<string, Partial<MetricDelta>>>): MetricDelta[] {
  const base = (metric: string): MetricDelta => ({
    metric,
    status: DeltaStatus.INSUFFICIENT_HISTORY,
    previousValue: null,
    currentValue: null,
    previousObservedAt: null,
    currentObservedAt: NOW,
    absoluteChange: null,
    percentChange: null,
    percentagePointChange: null,
    confidence: null,
  });
  return ["liquidityUsd", "holderCount", "top10Pct", "top20Pct"].map((m) => ({ ...base(m), ...(overrides[m] ?? {}) }));
}

describe("buildHistoricalSignals", () => {
  it("emits LIQUIDITY_GROWTH for an INCREASED liquidity delta", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({ liquidityUsd: { status: DeltaStatus.INCREASED, previousValue: 100_000, currentValue: 135_000, percentChange: 35 } }),
      NOW,
    );
    const s = signals.find((s) => s.signalType === "LIQUIDITY_GROWTH");
    expect(s).toBeDefined();
    expect(s?.direction).toBe("POSITIVE");
    expect(s?.source).toBe("historical");
  });

  it("emits LIQUIDITY_DECLINE for a DECREASED liquidity delta, with strength scaled to magnitude", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({ liquidityUsd: { status: DeltaStatus.DECREASED, previousValue: 200_000, currentValue: 100_000, percentChange: -50 } }),
      NOW,
    );
    const s = signals.find((s) => s.signalType === "LIQUIDITY_DECLINE");
    expect(s?.direction).toBe("NEGATIVE");
    expect(s?.strength).toBe("HIGH");
  });

  it("emits no liquidity signal when the delta is UNCHANGED", () => {
    const signals = buildHistoricalSignals(makeComparisons({ liquidityUsd: { status: DeltaStatus.UNCHANGED } }), NOW);
    expect(signals.some((s) => s.signalType === "LIQUIDITY_GROWTH" || s.signalType === "LIQUIDITY_DECLINE")).toBe(false);
  });

  it("emits no liquidity signal when the delta is UNAVAILABLE or INSUFFICIENT_HISTORY", () => {
    for (const status of [DeltaStatus.UNAVAILABLE, DeltaStatus.INSUFFICIENT_HISTORY, DeltaStatus.NOT_COMPARABLE]) {
      const signals = buildHistoricalSignals(makeComparisons({ liquidityUsd: { status } }), NOW);
      expect(signals.some((s) => s.signalType === "LIQUIDITY_GROWTH" || s.signalType === "LIQUIDITY_DECLINE")).toBe(false);
    }
  });

  it("emits HOLDER_CONCENTRATION_INCREASE (NEGATIVE direction — mirrors TOP10_CONCENTRATION's elevated=NEGATIVE convention) for rising concentration", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({ top10Pct: { status: DeltaStatus.INCREASED, previousValue: 40, currentValue: 55, percentagePointChange: 15 } }),
      NOW,
    );
    const s = signals.find((s) => s.signalType === "HOLDER_CONCENTRATION_INCREASE");
    expect(s?.direction).toBe("NEGATIVE");
    expect(s?.strength).toBe("HIGH");
  });

  it("emits HOLDER_CONCENTRATION_DECREASE (POSITIVE direction) for falling concentration", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({ top10Pct: { status: DeltaStatus.DECREASED, previousValue: 55, currentValue: 40, percentagePointChange: -15 } }),
      NOW,
    );
    const s = signals.find((s) => s.signalType === "HOLDER_CONCENTRATION_DECREASE");
    expect(s?.direction).toBe("POSITIVE");
  });

  it("never emits a HOLDER_GROWTH signal — that stays owned by analyzers/holders-analyzer.ts to avoid duplication", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({ holderCount: { status: DeltaStatus.INCREASED, previousValue: 500, currentValue: 650, percentChange: 30 } }),
      NOW,
    );
    expect(signals.some((s) => s.signalType === "HOLDER_GROWTH")).toBe(false);
  });

  it("returns no signals at all when nothing qualifies", () => {
    expect(buildHistoricalSignals(makeComparisons({}), NOW)).toEqual([]);
  });

  it("every emitted signal carries a factual, non-accusatory evidence sentence with no verdict language", () => {
    const signals = buildHistoricalSignals(
      makeComparisons({
        liquidityUsd: { status: DeltaStatus.DECREASED, previousValue: 200_000, currentValue: 50_000, percentChange: -75 },
        top10Pct: { status: DeltaStatus.INCREASED, previousValue: 30, currentValue: 60, percentagePointChange: 30 },
      }),
      NOW,
    );
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.evidence.toLowerCase()).not.toMatch(/\b(scam|scammer|fake|fraud|malicious|rug)\b/);
    }
  });
});
