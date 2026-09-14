import type { LiquiditySnapshot } from "../types/domain.js";
import { Confidence, Direction, Strength, type Signal, SignalType } from "../types/intelligence.js";

/**
 * Single-snapshot liquidity/flow signals. These use ratios (market cap /
 * liquidity, volume / liquidity) rather than growth-over-time, because a
 * single DexScreener call only gives one point in time. Growth-based
 * signals (LIQUIDITY_GROWTH, LIQUIDITY_DECLINE) activate once the
 * HistoryStore has at least two snapshots for the token — see
 * docs/ROADMAP.md Phase 4.
 */
export function analyzeLiquidity(data: LiquiditySnapshot, now: string = new Date().toISOString()): Signal[] {
  const signals: Signal[] = [];
  const push = (
    signalType: SignalType,
    direction: Direction,
    strength: Strength,
    confidence: Confidence,
    evidence: string,
  ) => {
    signals.push({ signalType, direction, strength, confidence, source: "liquidity", evidence, timestamp: now });
  };

  if (data.liquidityUsd !== undefined) {
    const low = data.liquidityUsd < 10_000;
    const high = data.liquidityUsd >= 100_000;
    push(
      SignalType.LIQUIDITY_STRENGTH,
      low ? Direction.NEGATIVE : high ? Direction.POSITIVE : Direction.NEUTRAL,
      low ? Strength.HIGH : high ? Strength.MEDIUM : Strength.LOW,
      Confidence.HIGH,
      `Pooled liquidity is $${Math.round(data.liquidityUsd).toLocaleString("en-US")}.`,
    );
  }

  if (data.marketCapUsd !== undefined && data.liquidityUsd !== undefined && data.liquidityUsd > 0) {
    const ratio = data.marketCapUsd / data.liquidityUsd;
    if (ratio >= 10) {
      push(
        SignalType.MC_LIQUIDITY_DIVERGENCE,
        Direction.NEGATIVE,
        ratio >= 30 ? Strength.HIGH : Strength.MEDIUM,
        Confidence.HIGH,
        `Market cap ($${Math.round(data.marketCapUsd).toLocaleString("en-US")}) is ${ratio.toFixed(
          1,
        )}x pooled liquidity ($${Math.round(data.liquidityUsd).toLocaleString("en-US")}).`,
      );
    }
  }

  if (data.volumeUsd24h !== undefined && data.liquidityUsd !== undefined && data.liquidityUsd > 0) {
    const ratio = data.volumeUsd24h / data.liquidityUsd;
    if (ratio >= 3) {
      push(
        SignalType.VOLUME_LIQUIDITY_DIVERGENCE,
        Direction.NEGATIVE,
        ratio >= 8 ? Strength.HIGH : Strength.MEDIUM,
        Confidence.MEDIUM,
        `24h volume ($${Math.round(data.volumeUsd24h).toLocaleString("en-US")}) is ${ratio.toFixed(
          1,
        )}x pooled liquidity — market activity is outrunning available depth.`,
      );
    }
  }

  if (data.buys24h !== undefined && data.sells24h !== undefined && data.buys24h + data.sells24h > 0) {
    const total = data.buys24h + data.sells24h;
    const buyShare = data.buys24h / total;
    if (Math.abs(buyShare - 0.5) >= 0.15 && total >= 10) {
      push(
        SignalType.BUY_SELL_IMBALANCE,
        buyShare > 0.5 ? Direction.POSITIVE : Direction.NEGATIVE,
        Math.abs(buyShare - 0.5) >= 0.3 ? Strength.HIGH : Strength.MEDIUM,
        Confidence.MEDIUM,
        `${data.buys24h} buys vs ${data.sells24h} sells in 24h (${(buyShare * 100).toFixed(0)}% buys).`,
      );
    }
  }

  if (data.priceChangePct24h !== undefined && Math.abs(data.priceChangePct24h) >= 15) {
    push(
      SignalType.PRICE_MOMENTUM,
      data.priceChangePct24h > 0 ? Direction.POSITIVE : Direction.NEGATIVE,
      Math.abs(data.priceChangePct24h) >= 50 ? Strength.HIGH : Strength.MEDIUM,
      Confidence.MEDIUM,
      `Price moved ${data.priceChangePct24h.toFixed(1)}% over 24h.`,
    );
  }

  return signals;
}
