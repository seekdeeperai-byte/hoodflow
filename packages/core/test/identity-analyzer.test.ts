import { describe, expect, it } from "vitest";
import { analyzeIdentity } from "../src/analyzers/identity-analyzer.js";
import { IdentityStatus, type IdentityResolution } from "../src/types/identity.js";
import { SignalType } from "../src/types/intelligence.js";

const now = "2026-09-15T00:00:00.000Z";
const CHAIN_ID = 4663;
const ADDR = "0x1111111111111111111111111111111111111111";

function base(overrides: Partial<IdentityResolution>): IdentityResolution {
  return {
    chainId: CHAIN_ID,
    contractAddress: ADDR,
    status: IdentityStatus.UNVERIFIED,
    confidence: null,
    match: null,
    conflicts: [],
    providerObserved: [],
    observedAt: now,
    ...overrides,
  };
}

describe("analyzeIdentity", () => {
  it("emits OFFICIAL_IDENTITY_MATCH for a CONFIRMED official_docs match", () => {
    const signals = analyzeIdentity(
      base({
        status: IdentityStatus.CONFIRMED,
        confidence: "HIGH",
        match: { source: "official_docs", address: ADDR, symbol: "USDG", name: "Global Dollar", note: "x" },
      }),
    );
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.OFFICIAL_IDENTITY_MATCH]);
    expect(signals[0]?.direction).toBe("POSITIVE");
    expect(signals[0]?.source).toBe("identity");
  });

  it("emits IDENTITY_CONFIRMED (not OFFICIAL_IDENTITY_MATCH) for a live_confirmed_third_party match", () => {
    const signals = analyzeIdentity(
      base({
        status: IdentityStatus.CONFIRMED,
        confidence: "MEDIUM",
        match: { source: "live_confirmed_third_party", address: ADDR, symbol: "GME", note: "x" },
      }),
    );
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.IDENTITY_CONFIRMED]);
  });

  it("emits NON_OFFICIAL_IDENTITY_CONTEXT for an unconfirmed_third_party match — never 'confirmed' language for weak provenance", () => {
    const signals = analyzeIdentity(
      base({
        status: IdentityStatus.CONFIRMED,
        confidence: "LOW",
        match: { source: "unconfirmed_third_party", address: ADDR, symbol: "X", note: "x" },
      }),
    );
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.NON_OFFICIAL_IDENTITY_CONTEXT]);
  });

  it("emits IDENTITY_MISMATCH for CONFLICTING", () => {
    const signals = analyzeIdentity(base({ status: IdentityStatus.CONFLICTING }));
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.IDENTITY_MISMATCH]);
    expect(signals[0]?.direction).toBe("NEGATIVE");
  });

  it("emits IDENTITY_AMBIGUITY for AMBIGUOUS", () => {
    const signals = analyzeIdentity(base({ status: IdentityStatus.AMBIGUOUS }));
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.IDENTITY_AMBIGUITY]);
  });

  it("emits IDENTITY_UNVERIFIED for UNVERIFIED", () => {
    const signals = analyzeIdentity(base({ status: IdentityStatus.UNVERIFIED }));
    expect(signals.map((s) => s.signalType)).toEqual([SignalType.IDENTITY_UNVERIFIED]);
  });

  it("emits nothing for UNAVAILABLE (caller adds a limitation instead)", () => {
    const signals = analyzeIdentity(base({ status: IdentityStatus.UNAVAILABLE }));
    expect(signals).toHaveLength(0);
  });

  it("emits IDENTITY_COLLISION alongside the primary status signal whenever conflicts exist", () => {
    const signals = analyzeIdentity(
      base({
        status: IdentityStatus.CONFIRMED,
        confidence: "MEDIUM",
        match: { source: "live_confirmed_third_party", address: ADDR, symbol: "GME", note: "x" },
        conflicts: [
          {
            description: "x",
            conflictingAddress: "0x2222222222222222222222222222222222222222",
            conflictingSymbol: "GME",
            conflictingSource: "test_fixture",
          },
        ],
      }),
    );
    expect(signals.map((s) => s.signalType).sort()).toEqual([SignalType.IDENTITY_COLLISION, SignalType.IDENTITY_CONFIRMED].sort());
  });

  it("never emits an affirmative verdict/accusation in any signal's evidence text (a disclaiming phrase like 'not evidence of malicious intent' is fine and expected)", () => {
    const scenarios: IdentityResolution[] = [
      base({ status: IdentityStatus.CONFIRMED, confidence: "HIGH", match: { source: "official_docs", address: ADDR, symbol: "USDG", note: "x" } }),
      base({ status: IdentityStatus.CONFLICTING }),
      base({ status: IdentityStatus.AMBIGUOUS }),
      base({ status: IdentityStatus.UNVERIFIED }),
      base({
        status: IdentityStatus.UNVERIFIED,
        conflicts: [{ description: "x", conflictingAddress: "0x2222222222222222222222222222222222222222", conflictingSymbol: "Y" }],
      }),
    ];
    const AFFIRMATIVE_ACCUSATION = /\b(is|are|this)\s+(a\s+)?(scam|scammer|fake|fraud|malicious|guaranteed rug)\b|\bSCAM\b|\bFAKE\b|\bFRAUD\b/;
    for (const resolution of scenarios) {
      for (const signal of analyzeIdentity(resolution)) {
        expect(signal.evidence).not.toMatch(AFFIRMATIVE_ACCUSATION);
      }
    }
  });
});
