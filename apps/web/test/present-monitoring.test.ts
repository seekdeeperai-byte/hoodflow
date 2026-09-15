import { describe, expect, it } from "vitest";
import { DEMO_REPORT } from "../lib/sample-report";
import { deriveMonitoringItems } from "../lib/present-monitoring";
import type { HoodflowReport } from "@hoodflow/core";

describe("deriveMonitoringItems", () => {
  it("produces no items when there are no negative signals, watch-listed temporal relationships, or limitations", () => {
    const report: HoodflowReport = {
      ...DEMO_REPORT,
      signals: DEMO_REPORT.signals.filter((s) => s.direction !== "NEGATIVE"),
      history: { ...DEMO_REPORT.history, relationships: [] },
      limitations: [],
    };
    expect(deriveMonitoringItems(report)).toEqual([]);
  });

  it("surfaces every NEGATIVE-direction signal as a 'Potential concern' item, verbatim from its evidence", () => {
    const report: HoodflowReport = {
      ...DEMO_REPORT,
      signals: [
        {
          signalType: "MINT_CAPABILITY",
          direction: "NEGATIVE",
          strength: "HIGH",
          confidence: "HIGH",
          source: "contract",
          evidence: "The contract owner can mint new tokens at will.",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
      history: { ...DEMO_REPORT.history, relationships: [] },
      limitations: [],
    };
    const items = deriveMonitoringItems(report);
    expect(items).toEqual([{ kind: "signal", text: "Potential concern: The contract owner can mint new tokens at will." }]);
  });

  it("only flags temporal relationships on the explicit watch-allowlist, not every relationship type", () => {
    const report: HoodflowReport = {
      ...DEMO_REPORT,
      signals: [],
      limitations: [],
      history: {
        ...DEMO_REPORT.history,
        relationships: [
          {
            relationshipType: "CONCENTRATED_LIQUIDITY_GROWTH",
            confidence: "MEDIUM",
            supportingTrends: [],
            evidence: [],
            interpretation: "Liquidity increased alongside rising concentration.",
          },
        ],
      },
    };
    const items = deriveMonitoringItems(report);
    expect(items).toEqual([{ kind: "temporal", text: "Watch for: Liquidity increased alongside rising concentration." }]);
  });

  it("only flags cross-source relationships on the explicit watch-allowlist, not every relationship type (e.g. MULTI_SOURCE_CONVERGENCE is not flagged)", () => {
    const report: HoodflowReport = {
      ...DEMO_REPORT,
      signals: [],
      limitations: [],
      history: { ...DEMO_REPORT.history, relationships: [] },
      crossSource: {
        ...DEMO_REPORT.crossSource,
        relationships: [
          {
            relationshipType: "ATTENTION_LIQUIDITY_DIVERGENCE",
            observedAt: "2026-01-01T00:00:00.000Z",
            sourcesInvolved: ["ATTENTION", "ONCHAIN"],
            evidence: [],
            confidence: "MEDIUM",
            interpretation: "Attention is elevated while liquidity is not growing in proportion.",
            dataState: "AVAILABLE",
          },
        ],
      },
    };
    const items = deriveMonitoringItems(report);
    expect(items).toEqual([{ kind: "crossSource", text: "Watch for: Attention is elevated while liquidity is not growing in proportion." }]);
  });

  it("surfaces every disclosed limitation as a 'Monitor' item", () => {
    const report: HoodflowReport = {
      ...DEMO_REPORT,
      signals: [],
      history: { ...DEMO_REPORT.history, relationships: [] },
      limitations: ["Social and news intelligence are not yet implemented."],
    };
    expect(deriveMonitoringItems(report)).toEqual([
      { kind: "limitation", text: "Monitor: Social and news intelligence are not yet implemented." },
    ]);
  });
});
