import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.js";
import { DataState } from "../src/types/data-state.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import { MarketState } from "../src/types/intelligence.js";

const baseToken = { chainId: 4663, address: "0x1111111111111111111111111111111111111111" };
const now = new Date().toISOString();

function snapshot(overrides: Partial<TokenSnapshot>): TokenSnapshot {
  return {
    token: baseToken,
    capturedAt: now,
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: { state: DataState.DATA_UNAVAILABLE },
    holders: { state: DataState.DATA_UNAVAILABLE },
    ...overrides,
  };
}

describe("buildReport", () => {
  it("returns INSUFFICIENT_DATA and explicit limitations when nothing is available", () => {
    const report = buildReport(snapshot({}));
    expect(report.marketState.state).toBe(MarketState.INSUFFICIENT_DATA);
    expect(report.signals).toHaveLength(0);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.score.dataQualityScore).toBe(0);
  });

  it("never fabricates social/news data — always DATA_UNAVAILABLE in this build", () => {
    const report = buildReport(snapshot({}));
    expect(report.social.state).toBe(DataState.DATA_UNAVAILABLE);
    expect(report.news.state).toBe(DataState.DATA_UNAVAILABLE);
  });

  it("selects CONTRACT_RISK when a high-severity contract signal is present, overriding market-state relationships", () => {
    const report = buildReport(
      snapshot({
        contract: { state: DataState.AVAILABLE, data: { isMintable: true, isHoneypot: true } },
        liquidity: {
          state: DataState.AVAILABLE,
          data: { liquidityUsd: 200_000, marketCapUsd: 250_000, buys24h: 300, sells24h: 100 },
        },
      }),
    );
    expect(report.marketState.state).toBe(MarketState.CONTRACT_RISK);
  });

  it("produces a full pipeline result (signals -> relationships -> interpretations) for a demand-expansion-like snapshot", () => {
    const report = buildReport(
      snapshot({
        contract: { state: DataState.AVAILABLE, data: { isOpenSource: true } },
        liquidity: {
          state: DataState.AVAILABLE,
          data: { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 },
        },
      }),
    );
    expect(report.signals.length).toBeGreaterThan(0);
    expect(report.relationships.length).toBeGreaterThan(0);
    expect(report.interpretations.length).toBeGreaterThan(0);
    expect(report.marketState.state).toBe(MarketState.DEMAND_EXPANSION);
    // every interpretation must carry a confidence and at least one limitation-or-metric, never bare assertions
    for (const interp of report.interpretations) {
      expect(interp.confidence).toBeTruthy();
      expect(interp.supportingMetrics.length + interp.limitations.length).toBeGreaterThan(0);
    }
  });

  it("degrades gracefully with PARTIAL liquidity data instead of crashing", () => {
    const report = buildReport(
      snapshot({
        liquidity: { state: DataState.PARTIAL, data: { liquidityUsd: 50_000 }, error: "volume unavailable" },
      }),
    );
    expect(report.dataQuality.liquidity).toBe(DataState.PARTIAL);
  });
});
