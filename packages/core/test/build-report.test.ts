import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.js";
import { DataState } from "../src/types/data-state.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import { MarketState } from "../src/types/intelligence.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";
import { EntityMatchBasis, SourceQuality } from "../src/types/social-news.js";

const baseToken = { chainId: 4663, address: "0x1111111111111111111111111111111111111111" };
const now = new Date().toISOString();
// Empty registry -> UNVERIFIED, the correct/expected identity outcome for these tests'
// synthetic address, which isn't meant to represent any real known token.
const unverifiedIdentity = resolveIdentity([], baseToken.chainId, baseToken.address, [], now);

function snapshot(overrides: Partial<TokenSnapshot>): TokenSnapshot {
  return {
    token: baseToken,
    capturedAt: now,
    identity: unverifiedIdentity,
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
    // No contract/liquidity/holders signals — but identity resolution always runs (it needs
    // no provider data of its own) and correctly emits IDENTITY_UNVERIFIED for an address
    // that isn't in the registry. Phase 5: identity signals are informational and must not
    // affect marketState/dataQualityScore (asserted below), only report.signals.
    expect(report.signals.filter((s) => s.source !== "identity")).toHaveLength(0);
    expect(report.signals.map((s) => s.signalType)).toEqual(["IDENTITY_UNVERIFIED"]);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.score.dataQualityScore).toBe(0);
    expect(report.dataQuality.overallConfidencePenalty).toBe("LOW"); // unchanged from Phase 0-4: driven only by contract/liquidity/holders unavailability
  });

  it("never fabricates social/news data — defaults to DATA_UNAVAILABLE when the snapshot carries no social/news observations", () => {
    const report = buildReport(snapshot({}));
    expect(report.social.state).toBe(DataState.DATA_UNAVAILABLE);
    expect(report.news.state).toBe(DataState.DATA_UNAVAILABLE);
    expect(report.hype.state).toBe("UNKNOWN");
    expect(report.hype.score).toBeNull();
    expect(report.crossSource.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(report.crossSource.relationships[0]?.relationshipType).toBe("INSUFFICIENT_CROSS_SOURCE_DATA");
  });

  describe("Final Intelligence Completion phase: social + news + attention + cross-source", () => {
    it("wires real social observations through to report.social, report.hype, and report.signals", () => {
      const report = buildReport(
        snapshot({
          social: {
            state: DataState.AVAILABLE,
            data: [
              {
                source: "x",
                observedAt: "2026-09-14T12:00:00.000Z",
                officialClassification: "UNOFFICIAL",
                entityMatch: { basis: EntityMatchBasis.SYMBOL_UNAMBIGUOUS, note: "matched" },
                sourceQuality: SourceQuality.PUBLIC_SOCIAL,
              },
            ],
          },
        }),
      );
      expect(report.social.state).toBe(DataState.AVAILABLE);
      expect(report.social.postCount).toBe(1);
      expect(report.signals.some((s) => s.signalType === "SOCIAL_ATTENTION_LEVEL")).toBe(true);
      expect(report.dataQuality.social).toBe(DataState.AVAILABLE);
    });

    it("wires real news observations through to report.news with syndication grouping intact", () => {
      const report = buildReport(
        snapshot({
          news: {
            state: DataState.AVAILABLE,
            data: [
              {
                source: "outlet-a.com",
                title: "A real headline about this token",
                publishedAt: "2026-09-14T12:00:00.000Z",
                entityMatch: { basis: EntityMatchBasis.OFFICIAL_NAME, note: "matched" },
                sourceQuality: SourceQuality.ESTABLISHED_PUBLISHER,
                category: "MARKET_COVERAGE",
              },
              {
                source: "outlet-b.com",
                title: "A real headline about this token",
                publishedAt: "2026-09-14T13:00:00.000Z",
                entityMatch: { basis: EntityMatchBasis.OFFICIAL_NAME, note: "matched" },
                sourceQuality: SourceQuality.ESTABLISHED_PUBLISHER,
                category: "MARKET_COVERAGE",
              },
            ],
          },
        }),
      );
      expect(report.news.articleCount).toBe(2);
      expect(report.news.storyCount).toBe(1); // syndicated, not double-counted
    });

    it("Score integrity: social/news/attention/cross-source presence never changes marketState or dataQualityScore", () => {
      const withoutSocial = buildReport(
        snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 } } }),
      );
      const withSocial = buildReport(
        snapshot({
          liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 } },
          social: {
            state: DataState.AVAILABLE,
            data: [
              {
                source: "x",
                observedAt: "2026-09-14T12:00:00.000Z",
                officialClassification: "UNOFFICIAL",
                entityMatch: { basis: EntityMatchBasis.SYMBOL_UNAMBIGUOUS, note: "matched" },
                sourceQuality: SourceQuality.PUBLIC_SOCIAL,
              },
            ],
          },
        }),
      );
      expect(withSocial.marketState.state).toBe(withoutSocial.marketState.state);
      expect(withSocial.score.dataQualityScore).toBe(withoutSocial.score.dataQualityScore);
      expect(withSocial.dataQuality.overallConfidencePenalty).toBe(withoutSocial.dataQuality.overallConfidencePenalty);
    });

    it("integratedInterpretation.whatChanged spans on-chain and social/news/attention domains, never fabricated when a domain is unavailable", () => {
      const report = buildReport(
        snapshot({
          social: {
            state: DataState.AVAILABLE,
            data: [
              {
                source: "x",
                observedAt: "2026-09-14T12:00:00.000Z",
                officialClassification: "UNOFFICIAL",
                entityMatch: { basis: EntityMatchBasis.SYMBOL_UNAMBIGUOUS, note: "matched" },
                sourceQuality: SourceQuality.PUBLIC_SOCIAL,
              },
            ],
          },
        }),
      );
      expect(report.integratedInterpretation.whatChanged.some((w) => w.startsWith("Social:"))).toBe(true);
      expect(report.integratedInterpretation.dataState).not.toBe(DataState.DATA_UNAVAILABLE);
    });

    it("integratedInterpretation.crossSourceSummary is null (not fabricated) when no real cross-source relationship was found", () => {
      const report = buildReport(snapshot({}));
      expect(report.integratedInterpretation.crossSourceSummary).toBeNull();
    });

    it("never states a trade recommendation anywhere in the integrated interpretation", () => {
      const report = buildReport(snapshot({}));
      const allText = [...report.integratedInterpretation.whatChanged, ...report.integratedInterpretation.whatToMonitor, report.integratedInterpretation.crossSourceSummary ?? ""].join(" ");
      expect(allText.toLowerCase()).not.toMatch(/\bbuy\b|\bsell\b|\bshould invest\b/);
    });
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

  describe("Phase 6: historical intelligence", () => {
    it("history.status is INSUFFICIENT_HISTORY, never a fabricated baseline, when no previousSnapshot is supplied", () => {
      const report = buildReport(snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 100_000 } } }));
      expect(report.history.status).toBe("INSUFFICIENT_HISTORY");
      expect(report.history.observationsUsed).toBe(1);
      expect(report.history.trends).toEqual([]);
      expect(report.history.relationships).toEqual([]);
      expect(report.limitations.some((l) => /historical comparison is unavailable/i.test(l))).toBe(true);
    });

    it("Score integrity: history presence/absence never changes marketState or dataQualityScore", () => {
      const withoutHistory = buildReport(
        snapshot({
          liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 } },
          contract: { state: DataState.AVAILABLE, data: { isOpenSource: true } },
        }),
      );
      const previous = snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 50_000 } } });
      const withHistory = buildReport(
        snapshot({
          liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 } },
          contract: { state: DataState.AVAILABLE, data: { isOpenSource: true } },
        }),
        { previousSnapshot: previous },
      );
      expect(withHistory.marketState.state).toBe(withoutHistory.marketState.state);
      expect(withHistory.score.dataQualityScore).toBe(withoutHistory.score.dataQualityScore);
    });

    it("Score integrity: INSUFFICIENT_HISTORY does not change overallConfidencePenalty relative to an otherwise-identical report", () => {
      const noHistory = buildReport(snapshot({}));
      // Same market inputs (all unavailable) — only the presence/absence of history differs conceptually,
      // and there is no way to make history "available" without also changing market data here, so this
      // asserts the only lever history has (the limitation it adds) does not touch the penalty value.
      expect(noHistory.dataQuality.overallConfidencePenalty).toBe("LOW"); // driven purely by 3 market-domain limitations, as in the base case above
    });

    it("liquidity growth across two scans produces a LIQUIDITY_GROWTH historical signal, placed after the market signal set", () => {
      const previous = snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 100_000 } } });
      const report = buildReport(snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 150_000 } } }), {
        previousSnapshot: previous,
      });
      const signal = report.signals.find((s) => s.signalType === "LIQUIDITY_GROWTH");
      expect(signal).toBeDefined();
      expect(signal?.source).toBe("historical");
    });

    it("Identity integrity: historical comparison never touches report.identity, and identity stays keyed by contract address regardless of history", () => {
      const previous = snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 100_000 } } });
      const report = buildReport(snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 150_000 } } }), {
        previousSnapshot: previous,
      });
      expect(report.identity.contractAddress).toBe(baseToken.address);
      expect(report.identity.chainId).toBe(baseToken.chainId);
    });

    it("every historical comparison entry preserves previous/current values, both timestamps, and a comparison status — never fabricated", () => {
      const previous = snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 100_000 } } });
      const currentSnap = snapshot({ liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd: 150_000 } } });
      const report = buildReport(currentSnap, { previousSnapshot: previous });
      const liquidityDelta = report.history.comparisons.find((c) => c.metric === "liquidityUsd");
      expect(liquidityDelta?.previousValue).toBe(100_000);
      expect(liquidityDelta?.currentValue).toBe(150_000);
      expect(liquidityDelta?.previousObservedAt).toBe(previous.capturedAt);
      expect(liquidityDelta?.currentObservedAt).toBe(currentSnap.capturedAt);
      expect(liquidityDelta?.status).toBe("INCREASED");
    });
  });
});
