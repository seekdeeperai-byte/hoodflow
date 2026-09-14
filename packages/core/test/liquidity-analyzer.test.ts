import { describe, expect, it } from "vitest";
import { analyzeLiquidity } from "../src/analyzers/liquidity-analyzer.js";
import { SignalType } from "../src/types/intelligence.js";

describe("analyzeLiquidity", () => {
  it("flags market-cap/liquidity divergence when mc is >=10x liquidity, matching the product example", () => {
    // Product spec example: MC +74%, Volume +112%, Liquidity +6% — mc/liquidity ratio is what
    // this single-snapshot proxy captures without needing two historical points.
    const signals = analyzeLiquidity({ marketCapUsd: 3_400_000, liquidityUsd: 96_000, volumeUsd24h: 812_000 });
    const divergence = signals.find((s) => s.signalType === SignalType.MC_LIQUIDITY_DIVERGENCE);
    expect(divergence).toBeDefined();
    expect(divergence?.direction).toBe("NEGATIVE");
    expect(divergence?.evidence).toMatch(/35\.4x|35\.[0-9]x/); // 3.4M / 96k ≈ 35.4x
  });

  it("flags volume/liquidity divergence when 24h volume outruns pooled depth", () => {
    const signals = analyzeLiquidity({ liquidityUsd: 96_000, volumeUsd24h: 812_000 });
    expect(signals.find((s) => s.signalType === SignalType.VOLUME_LIQUIDITY_DIVERGENCE)).toBeDefined();
  });

  it("does not flag divergence for healthy liquidity-to-activity ratios", () => {
    const signals = analyzeLiquidity({ marketCapUsd: 200_000, liquidityUsd: 150_000, volumeUsd24h: 100_000 });
    expect(signals.find((s) => s.signalType === SignalType.MC_LIQUIDITY_DIVERGENCE)).toBeUndefined();
    expect(signals.find((s) => s.signalType === SignalType.VOLUME_LIQUIDITY_DIVERGENCE)).toBeUndefined();
  });

  it("computes buy/sell imbalance direction correctly", () => {
    const buyHeavy = analyzeLiquidity({ buys24h: 340, sells24h: 110 });
    const sellHeavy = analyzeLiquidity({ buys24h: 80, sells24h: 320 });
    expect(buyHeavy.find((s) => s.signalType === SignalType.BUY_SELL_IMBALANCE)?.direction).toBe("POSITIVE");
    expect(sellHeavy.find((s) => s.signalType === SignalType.BUY_SELL_IMBALANCE)?.direction).toBe("NEGATIVE");
  });

  it("ignores buy/sell imbalance on tiny sample sizes", () => {
    const signals = analyzeLiquidity({ buys24h: 3, sells24h: 1 });
    expect(signals.find((s) => s.signalType === SignalType.BUY_SELL_IMBALANCE)).toBeUndefined();
  });
});
