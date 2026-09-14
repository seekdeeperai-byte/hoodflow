import { describe, expect, it } from "vitest";
import { analyzeHolders } from "../src/analyzers/holders-analyzer.js";
import { SignalType } from "../src/types/intelligence.js";

describe("analyzeHolders", () => {
  it("flags a very small holder base as HOLDER_CONCENTRATION even with no percentage data", () => {
    const signals = analyzeHolders({ holderCount: 12 });
    const sig = signals.find((s) => s.signalType === SignalType.HOLDER_CONCENTRATION);
    expect(sig).toBeDefined();
    expect(sig?.strength).toBe("HIGH");
  });

  it("flags TOP10/TOP20 concentration from Blockscout percentages independently of GoPlus data", () => {
    const signals = analyzeHolders({ holderCount: 5000, top10Pct: 72, top20Pct: 88 });
    expect(signals.find((s) => s.signalType === SignalType.TOP10_CONCENTRATION)?.strength).toBe("HIGH");
    expect(signals.find((s) => s.signalType === SignalType.TOP20_CONCENTRATION)?.strength).toBe("HIGH");
    for (const s of signals) expect(s.source).toBe("holders");
  });

  it("never emits HOLDER_GROWTH when no previous count is supplied — absence, not a fabricated flat reading", () => {
    const signals = analyzeHolders({ holderCount: 5000 }, undefined);
    expect(signals.find((s) => s.signalType === SignalType.HOLDER_GROWTH)).toBeUndefined();
  });

  it("computes HOLDER_GROWTH direction and magnitude correctly when a previous count is supplied", () => {
    const grew = analyzeHolders({ holderCount: 1200 }, 1000);
    const shrank = analyzeHolders({ holderCount: 800 }, 1000);
    const growthSignal = grew.find((s) => s.signalType === SignalType.HOLDER_GROWTH);
    const shrinkSignal = shrank.find((s) => s.signalType === SignalType.HOLDER_GROWTH);
    expect(growthSignal?.direction).toBe("POSITIVE");
    expect(growthSignal?.strength).toBe("HIGH"); // +20%
    expect(shrinkSignal?.direction).toBe("NEGATIVE");
    expect(shrinkSignal?.confidence).toBe("MEDIUM"); // never HIGH — single-comparison, not a smoothed trend
  });

  it("ignores noise-level holder count changes (<1%)", () => {
    const signals = analyzeHolders({ holderCount: 1005 }, 1000);
    expect(signals.find((s) => s.signalType === SignalType.HOLDER_GROWTH)).toBeUndefined();
  });

  it("does not divide by zero when previousHolderCount is 0", () => {
    expect(() => analyzeHolders({ holderCount: 100 }, 0)).not.toThrow();
    const signals = analyzeHolders({ holderCount: 100 }, 0);
    expect(signals.find((s) => s.signalType === SignalType.HOLDER_GROWTH)).toBeUndefined();
  });

  it("returns no signals for completely empty data (absent, not zero)", () => {
    expect(analyzeHolders({})).toHaveLength(0);
  });
});
