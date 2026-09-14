import type { HolderSummary } from "../types/domain.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../types/intelligence.js";

/**
 * Holder intelligence, restricted to what real available data can support
 * (product spec §6: "only for metrics that can be derived reliably from
 * available real data"). Explicitly NOT implemented here:
 *
 * - LARGE_HOLDER_ACTIVITY / DISTRIBUTION_QUALITY: need transaction-level
 *   history (who moved how much, when), which Blockscout's
 *   /tokens/{address}/holders endpoint doesn't provide — it's a current
 *   balance snapshot, not an activity feed. Tracked in docs/ROADMAP.md.
 *
 * HOLDER_GROWTH *is* implemented, but only fires when `previousHolderCount`
 * is supplied by the caller — which only happens when a HistoryStore
 * (packages/core/src/history/) actually has a prior scan for this token.
 * The first time HOODFLOW ever sees a token, there is nothing to compare
 * against and this function correctly emits no HOLDER_GROWTH signal at
 * all — that omission, not a fabricated "flat" or "0%" reading, is the
 * correct representation of "unmeasured." See build-report.ts for where
 * the caller-facing limitation text for this case lives.
 */
export function analyzeHolders(
  data: HolderSummary,
  previousHolderCount: number | undefined = undefined,
  now: string = new Date().toISOString(),
): Signal[] {
  const signals: Signal[] = [];
  const push = (
    signalType: SignalType,
    direction: Direction,
    strength: Strength,
    confidence: Confidence,
    evidence: string,
  ) => {
    signals.push({ signalType, direction, strength, confidence, source: "holders", evidence, timestamp: now });
  };

  if (data.holderCount !== undefined) {
    const veryLow = data.holderCount < 50;
    const low = data.holderCount < 200;
    if (veryLow || low) {
      push(
        SignalType.HOLDER_CONCENTRATION,
        Direction.NEGATIVE,
        veryLow ? Strength.HIGH : Strength.MEDIUM,
        Confidence.HIGH,
        `Only ${data.holderCount} holders recorded — a small holder base concentrates outcomes in few hands regardless of percentage distribution.`,
      );
    }
  }

  if (data.top10Pct !== undefined) {
    const elevated = data.top10Pct >= 50;
    push(
      SignalType.TOP10_CONCENTRATION,
      elevated ? Direction.NEGATIVE : Direction.NEUTRAL,
      data.top10Pct >= 70 ? Strength.HIGH : elevated ? Strength.MEDIUM : Strength.LOW,
      Confidence.MEDIUM, // MEDIUM, not HIGH: derived from one holders page, not the full holder set.
      `Blockscout: top 10 holders control ${data.top10Pct.toFixed(1)}% of supply.`,
    );
  }

  if (data.holderCount !== undefined && previousHolderCount !== undefined && previousHolderCount > 0) {
    const pctChange = ((data.holderCount - previousHolderCount) / previousHolderCount) * 100;
    if (Math.abs(pctChange) >= 1) {
      // Single prior-scan comparison, not a smoothed trend — MEDIUM confidence, never HIGH.
      push(
        SignalType.HOLDER_GROWTH,
        pctChange > 0 ? Direction.POSITIVE : Direction.NEGATIVE,
        Math.abs(pctChange) >= 20 ? Strength.HIGH : Math.abs(pctChange) >= 5 ? Strength.MEDIUM : Strength.LOW,
        Confidence.MEDIUM,
        `Holder count moved from ${previousHolderCount} to ${data.holderCount} since the previous scan (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%).`,
      );
    }
  }

  if (data.top20Pct !== undefined) {
    const elevated = data.top20Pct >= 65;
    push(
      SignalType.TOP20_CONCENTRATION,
      elevated ? Direction.NEGATIVE : Direction.NEUTRAL,
      data.top20Pct >= 85 ? Strength.HIGH : elevated ? Strength.MEDIUM : Strength.LOW,
      Confidence.MEDIUM,
      `Blockscout: top 20 holders control ${data.top20Pct.toFixed(1)}% of supply.`,
    );
  }

  return signals;
}
