import { isUsable, type DataState } from "../types/data-state.js";
import { Confidence } from "../types/intelligence.js";
import { DeltaStatus, type MetricDelta } from "../types/history.js";
import type { TokenSnapshot } from "../types/domain.js";

/**
 * Noise thresholds. `NOISE_THRESHOLD_PCT` matches the existing HOLDER_GROWTH
 * threshold in analyzers/holders-analyzer.ts exactly (documented there as
 * "Math.abs(pctChange) < 1"), reused here rather than invented, for every
 * amount-style metric (liquidity, holder count). `NOISE_THRESHOLD_PP` is a
 * new but analogous 1-percentage-point threshold for metrics that are
 * already expressed as a percentage (top10Pct/top20Pct) — first-pass,
 * documented, changeable, same posture as every other threshold in
 * docs/SCORING.md.
 */
const NOISE_THRESHOLD_PCT = 1;
const NOISE_THRESHOLD_PP = 1;

export type MetricKind = "amount" | "percentage";

export interface MetricInput {
  metric: string;
  kind: MetricKind;
  currentState: DataState;
  currentValue: number | undefined;
  previousState: DataState | undefined; // undefined when no previous scan exists at all
  previousValue: number | undefined;
}

/**
 * A value only counts as usable when its domain's DataState is
 * AVAILABLE/PARTIAL *and* the field itself is present *and* finite. This is
 * the concrete implementation of "missing != zero, unavailable != false,
 * provider failure != valid value" for historical comparison (Phase 6 §6):
 * an unusable value is never coerced into 0 or dropped silently — it simply
 * never reaches the arithmetic below.
 */
function usableValue(state: DataState | undefined, value: number | undefined): number | null {
  if (state === undefined || !isUsable(state) || value === undefined) return null;
  if (!Number.isFinite(value)) return null; // defensive: never propagate NaN/Infinity from an upstream provider
  return value;
}

export function computeMetricDelta(
  input: MetricInput,
  currentObservedAt: string,
  previousObservedAt: string | null,
  hasPreviousScan: boolean,
): MetricDelta {
  const currentValue = usableValue(input.currentState, input.currentValue);

  if (!hasPreviousScan) {
    return {
      metric: input.metric,
      status: DeltaStatus.INSUFFICIENT_HISTORY,
      previousValue: null,
      currentValue,
      previousObservedAt: null,
      currentObservedAt,
      absoluteChange: null,
      percentChange: null,
      percentagePointChange: null,
      confidence: null,
      note: "No prior scan exists for this token yet — nothing to compare against.",
    };
  }

  const previousValue = usableValue(input.previousState, input.previousValue);

  if (currentValue === null || previousValue === null) {
    const missingSide = currentValue === null && previousValue === null ? "both" : currentValue === null ? "current" : "previous";
    return {
      metric: input.metric,
      status: DeltaStatus.UNAVAILABLE,
      previousValue,
      currentValue,
      previousObservedAt,
      currentObservedAt,
      absoluteChange: null,
      percentChange: null,
      percentagePointChange: null,
      confidence: null,
      note:
        missingSide === "both"
          ? `${input.metric} was unavailable in both the previous and current scan.`
          : `${input.metric} is unavailable in the ${missingSide} scan (${missingSide === "current" ? input.currentState : input.previousState}) — a change cannot be calculated.`,
    };
  }

  // Defensive: these metrics are never legitimately negative. A negative value reaching here
  // would mean corrupted/attacker-controlled provider data, not a real observation — treat the
  // comparison as undefined rather than computing a misleading delta from it.
  if (currentValue < 0 || previousValue < 0) {
    return {
      metric: input.metric,
      status: DeltaStatus.NOT_COMPARABLE,
      previousValue,
      currentValue,
      previousObservedAt,
      currentObservedAt,
      absoluteChange: null,
      percentChange: null,
      percentagePointChange: null,
      confidence: null,
      note: `${input.metric} had a negative value in at least one scan, which is outside its valid range — comparison skipped.`,
    };
  }

  const absoluteChange = currentValue - previousValue;
  let percentChange: number | null = null;
  let percentagePointChange: number | null = null;
  let note: string | undefined;

  if (input.kind === "amount") {
    if (previousValue !== 0) {
      percentChange = (absoluteChange / previousValue) * 100;
    } else if (absoluteChange !== 0) {
      note = "Previous value was zero — percentage change is undefined; the absolute change is reported instead.";
    }
  } else {
    percentagePointChange = absoluteChange;
  }

  const magnitude = input.kind === "amount" ? (percentChange !== null ? Math.abs(percentChange) : null) : Math.abs(percentagePointChange!);
  const threshold = input.kind === "amount" ? NOISE_THRESHOLD_PCT : NOISE_THRESHOLD_PP;

  let status: DeltaStatus;
  if (magnitude === null) {
    status = absoluteChange === 0 ? DeltaStatus.UNCHANGED : absoluteChange > 0 ? DeltaStatus.INCREASED : DeltaStatus.DECREASED;
  } else {
    status = magnitude < threshold ? DeltaStatus.UNCHANGED : absoluteChange > 0 ? DeltaStatus.INCREASED : DeltaStatus.DECREASED;
  }

  return {
    metric: input.metric,
    status,
    previousValue,
    currentValue,
    previousObservedAt,
    currentObservedAt,
    absoluteChange,
    percentChange,
    percentagePointChange,
    confidence: Confidence.MEDIUM, // single prior-scan comparison, never HIGH — same convention as HOLDER_GROWTH
    note,
  };
}

/**
 * Builds the per-metric delta set for a scan, at minimum: liquidity
 * (amount), holder count (amount), top-10/top-20 concentration
 * (percentage). Pure — no I/O, deterministic, O(1) in the number of
 * metrics (bounded, fixed set — never scans full history; the caller is
 * responsible for supplying only the current + immediately-previous
 * snapshot, see history/build-history.ts).
 */
export function computeComparisons(current: TokenSnapshot, previous: TokenSnapshot | undefined): MetricDelta[] {
  const hasPreviousScan = previous !== undefined;
  const previousObservedAt = previous?.capturedAt ?? null;

  const inputs: MetricInput[] = [
    {
      metric: "liquidityUsd",
      kind: "amount",
      currentState: current.liquidity.state,
      currentValue: current.liquidity.data?.liquidityUsd,
      previousState: previous?.liquidity.state,
      previousValue: previous?.liquidity.data?.liquidityUsd,
    },
    {
      metric: "holderCount",
      kind: "amount",
      currentState: current.holders.state,
      currentValue: current.holders.data?.holderCount,
      previousState: previous?.holders.state,
      previousValue: previous?.holders.data?.holderCount,
    },
    {
      metric: "top10Pct",
      kind: "percentage",
      currentState: current.holders.state,
      currentValue: current.holders.data?.top10Pct,
      previousState: previous?.holders.state,
      previousValue: previous?.holders.data?.top10Pct,
    },
    {
      metric: "top20Pct",
      kind: "percentage",
      currentState: current.holders.state,
      currentValue: current.holders.data?.top20Pct,
      previousState: previous?.holders.state,
      previousValue: previous?.holders.data?.top20Pct,
    },
  ];

  return inputs.map((input) => computeMetricDelta(input, current.capturedAt, previousObservedAt, hasPreviousScan));
}
