import { describe, expect, it } from "vitest";
import { detectRelationships } from "../src/relationships/relationship-engine.js";
import { buildEvidence } from "../src/evidence/evidence-engine.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../src/types/intelligence.js";

const ts = new Date().toISOString();
const sig = (overrides: Partial<Signal>): Signal => ({
  signalType: SignalType.PRICE_MOMENTUM,
  direction: Direction.NEUTRAL,
  strength: Strength.MEDIUM,
  confidence: Confidence.MEDIUM,
  source: "liquidity",
  evidence: "test evidence",
  timestamp: ts,
  ...overrides,
});

describe("detectRelationships", () => {
  it("detects LIQUIDITY_LAGGING_ACTIVITY from MC/liquidity divergence", () => {
    const signals = [sig({ signalType: SignalType.MC_LIQUIDITY_DIVERGENCE, direction: Direction.NEGATIVE })];
    const rels = detectRelationships(signals);
    expect(rels.map((r) => r.relationshipType)).toContain("LIQUIDITY_LAGGING_ACTIVITY");
  });

  it("detects DEMAND_EXPANSION from positive buy/sell imbalance + liquidity strength, with no contradiction", () => {
    const signals = [
      sig({ signalType: SignalType.BUY_SELL_IMBALANCE, direction: Direction.POSITIVE }),
      sig({ signalType: SignalType.LIQUIDITY_STRENGTH, direction: Direction.POSITIVE }),
    ];
    const rels = detectRelationships(signals);
    const demand = rels.find((r) => r.relationshipType === "DEMAND_EXPANSION");
    expect(demand).toBeDefined();
    expect(demand?.contradictingSignals).toHaveLength(0);
    expect(demand?.confidence).toBe(Confidence.MEDIUM);
  });

  it("records contradicting evidence and lowers confidence when demand expansion coincides with liquidity divergence", () => {
    const signals = [
      sig({ signalType: SignalType.BUY_SELL_IMBALANCE, direction: Direction.POSITIVE }),
      sig({ signalType: SignalType.MC_LIQUIDITY_DIVERGENCE, direction: Direction.NEGATIVE }),
    ];
    const rels = detectRelationships(signals);
    const demand = rels.find((r) => r.relationshipType === "DEMAND_EXPANSION");
    expect(demand).toBeDefined();
    expect(demand?.contradictingSignals.length).toBeGreaterThan(0);
    expect(demand?.confidence).toBe(Confidence.LOW);
  });

  it("never produces a relationship with zero supporting signals", () => {
    const rels = detectRelationships([]);
    for (const r of rels) {
      expect(r.supportingSignals.length).toBeGreaterThan(0);
    }
    expect(rels).toHaveLength(0);
  });
});

describe("buildEvidence", () => {
  it("does a second contradiction sweep across all signals, not just the ones used to build the relationship", () => {
    const signals = [
      sig({ signalType: SignalType.BUY_SELL_IMBALANCE, direction: Direction.POSITIVE }),
      sig({ signalType: SignalType.LIQUIDITY_STRENGTH, direction: Direction.POSITIVE }),
      // Not consumed by the relationship engine's DEMAND_EXPANSION rule, but should still count as a contradiction.
      sig({ signalType: SignalType.TOP10_CONCENTRATION, direction: Direction.NEGATIVE, evidence: "top10 concentrated" }),
    ];
    const rels = detectRelationships(signals);
    const evidence = buildEvidence(rels, signals);
    const demandEvidence = evidence[rels.findIndex((r) => r.relationshipType === "DEMAND_EXPANSION")];
    expect(demandEvidence?.contradictingMetrics).toContain("top10 concentrated");
  });
});
