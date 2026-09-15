import { DeltaStatus, type MetricDelta } from "../types/history.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../types/intelligence.js";

/**
 * Converts qualifying historical deltas into Signals, reusing the exact
 * push()-closure convention already used by every other analyzer.
 * Deliberately narrow — this does NOT duplicate holder-count growth, which
 * already has a working, tested signal path (HOLDER_GROWTH in
 * analyzers/holders-analyzer.ts, driven by a previous-scan comparison of
 * its own). It only adds signals for metrics that don't already have one:
 *
 * - Liquidity growth/decline: SignalType.LIQUIDITY_GROWTH/LIQUIDITY_DECLINE
 *   have been typed since Phase 0 for exactly this ("activate once the
 *   HistoryStore has at least two snapshots" — see
 *   analyzers/liquidity-analyzer.ts's own doc comment) but were unused
 *   until this phase.
 * - Holder concentration trend: SignalType.HOLDER_CONCENTRATION_INCREASE/
 *   DECREASE are new this phase — TOP10_CONCENTRATION already covers "how
 *   concentrated is it right now" but nothing covered "is concentration
 *   changing over time" before Phase 6.
 *
 * These signals are appended to the report's `signals` array AFTER the
 * market Relationship/Evidence/marketState sweep has already run — the
 * same placement Phase 5 used for identity signals, and for the same
 * reason: they must stay informational and never silently change
 * marketState or score.dataQualityScore. See report/build-report.ts and
 * docs/HISTORICAL_INTELLIGENCE.md "Score integrity."
 */
export function buildHistoricalSignals(comparisons: MetricDelta[], now: string): Signal[] {
  const signals: Signal[] = [];
  const push = (signalType: SignalType, direction: Direction, strength: Strength, confidence: Confidence, evidence: string) => {
    signals.push({ signalType, direction, strength, confidence, source: "historical", evidence, timestamp: now });
  };

  const liquidity = comparisons.find((d) => d.metric === "liquidityUsd");
  if (liquidity && (liquidity.status === DeltaStatus.INCREASED || liquidity.status === DeltaStatus.DECREASED)) {
    const pct = liquidity.percentChange;
    const magnitude = pct !== null ? Math.abs(pct) : 100; // previousValue === 0 case: treat as a full (100%+) move, still real
    push(
      liquidity.status === DeltaStatus.INCREASED ? SignalType.LIQUIDITY_GROWTH : SignalType.LIQUIDITY_DECLINE,
      liquidity.status === DeltaStatus.INCREASED ? Direction.POSITIVE : Direction.NEGATIVE,
      magnitude >= 20 ? Strength.HIGH : magnitude >= 5 ? Strength.MEDIUM : Strength.LOW,
      Confidence.MEDIUM, // single prior-scan comparison, never HIGH — matches HOLDER_GROWTH's own convention
      `Pooled liquidity moved from $${Math.round(liquidity.previousValue ?? 0).toLocaleString("en-US")} to $${Math.round(
        liquidity.currentValue ?? 0,
      ).toLocaleString("en-US")} since the previous scan${pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}.`,
    );
  }

  const concentration = comparisons.find((d) => d.metric === "top10Pct");
  if (concentration && (concentration.status === DeltaStatus.INCREASED || concentration.status === DeltaStatus.DECREASED)) {
    const pp = concentration.percentagePointChange ?? 0;
    push(
      concentration.status === DeltaStatus.INCREASED ? SignalType.HOLDER_CONCENTRATION_INCREASE : SignalType.HOLDER_CONCENTRATION_DECREASE,
      // Rising concentration is the less-favorable direction (mirrors TOP10_CONCENTRATION's own
      // elevated=NEGATIVE convention); falling concentration is POSITIVE (ownership broadening).
      concentration.status === DeltaStatus.INCREASED ? Direction.NEGATIVE : Direction.POSITIVE,
      Math.abs(pp) >= 10 ? Strength.HIGH : Math.abs(pp) >= 3 ? Strength.MEDIUM : Strength.LOW,
      Confidence.MEDIUM,
      `Top-10 holder concentration moved from ${(concentration.previousValue ?? 0).toFixed(1)}% to ${(concentration.currentValue ?? 0).toFixed(
        1,
      )}% since the previous scan (${pp >= 0 ? "+" : ""}${pp.toFixed(1)} percentage points).`,
    );
  }

  return signals;
}
