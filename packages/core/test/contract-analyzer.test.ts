import { describe, expect, it } from "vitest";
import { analyzeContract } from "../src/analyzers/contract-analyzer.js";
import { SignalType } from "../src/types/intelligence.js";

describe("analyzeContract", () => {
  it("flags mint capability, blacklist, and pause as negative-high signals", () => {
    const signals = analyzeContract({ isMintable: true, isBlacklisted: true, canBePaused: true });
    const types = signals.map((s) => s.signalType);
    expect(types).toContain(SignalType.MINT_CAPABILITY);
    expect(types).toContain(SignalType.BLACKLIST_CAPABILITY);
    expect(types).toContain(SignalType.PAUSE_CAPABILITY);
    for (const s of signals) {
      expect(s.direction).toBe("NEGATIVE");
    }
  });

  it("never emits a verdict word like SCAM or SAFE in evidence text", () => {
    const signals = analyzeContract({
      isMintable: true,
      isHoneypot: true,
      isBlacklisted: true,
      ownerAddress: "0xabc",
      canTakeBackOwnership: true,
      top10HolderPct: 80,
    });
    const forbidden = /\b(scam|safe|guaranteed|100x|rug)\b/i;
    for (const s of signals) {
      expect(s.evidence).not.toMatch(forbidden);
    }
  });

  it("produces no signal for a field that was never provided (absent, not false)", () => {
    const signals = analyzeContract({});
    expect(signals).toHaveLength(0);
  });

  it("treats renounced ownership (zero address) as no ownership signal", () => {
    const signals = analyzeContract({ ownerAddress: "0x0000000000000000000000000000000000000000" });
    expect(signals.find((s) => s.signalType === SignalType.OWNERSHIP_RISK)).toBeUndefined();
  });

  it("scales fee-risk strength with tax magnitude", () => {
    const low = analyzeContract({ buyTaxPct: 12, sellTaxPct: 12 });
    const high = analyzeContract({ buyTaxPct: 30, sellTaxPct: 30 });
    expect(low.find((s) => s.signalType === SignalType.FEE_RISK)?.strength).toBe("MEDIUM");
    expect(high.find((s) => s.signalType === SignalType.FEE_RISK)?.strength).toBe("HIGH");
  });
});
