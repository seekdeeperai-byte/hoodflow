import { describe, expect, it } from "vitest";
import { analyzeAdversarial, toCanonicalAdversarialRelationships } from "../src/adversarial/adversarial-engine.js";
import { buildReport } from "../src/report/build-report.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";
import { DataState } from "../src/types/data-state.js";
import { HistoryStatus, TrendDirection, TrendType, type HistoricalComparison } from "../src/types/history.js";
import { IdentityStatus, type IdentityResolution } from "../src/types/identity.js";
import { Confidence } from "../src/types/intelligence.js";
import { EntityMatchBasis, SourceQuality, type NewsSummary, type SocialSummary } from "../src/types/social-news.js";
import { AdversarialSignalStatus, AdversarialSignalType } from "../src/types/adversarial.js";
import { tokenEntity } from "../src/types/entities.js";
import type { TokenSnapshot } from "../src/types/domain.js";

const NOW = "2026-09-19T12:00:00.000Z";
const PREVIOUS = "2026-09-19T06:00:00.000Z";
const CHAIN = 4663;
const ADDRESS = "0x1111111111111111111111111111111111111111";

function identityOf(status: IdentityStatus): IdentityResolution {
  return { chainId: CHAIN, contractAddress: ADDRESS, status, confidence: null, match: null, conflicts: [], providerObserved: [], observedAt: NOW };
}

function comparableHistory(overrides: Partial<HistoricalComparison> = {}): HistoricalComparison {
  return {
    status: HistoryStatus.COMPARABLE,
    observationsUsed: 2,
    currentObservedAt: NOW,
    previousObservedAt: PREVIOUS,
    comparisons: [],
    trends: [],
    relationships: [],
    ...overrides,
  };
}

const insufficientHistory: HistoricalComparison = {
  status: HistoryStatus.INSUFFICIENT_HISTORY,
  observationsUsed: 1,
  currentObservedAt: NOW,
  previousObservedAt: null,
  comparisons: [],
  trends: [],
  relationships: [],
};

function socialSummary(overrides: Partial<SocialSummary> = {}): SocialSummary {
  return { dataState: DataState.AVAILABLE, observations: [], limitations: [], ...overrides };
}

function newsSummary(overrides: Partial<NewsSummary> = {}): NewsSummary {
  return { dataState: DataState.AVAILABLE, storyGroups: [], limitations: [], ...overrides };
}

const unavailableSocial = socialSummary({ dataState: DataState.PROVIDER_UNAVAILABLE });
const unavailableNews = newsSummary({ dataState: DataState.PROVIDER_UNAVAILABLE });

function baseInput() {
  return {
    now: NOW,
    history: comparableHistory(),
    identity: identityOf(IdentityStatus.CONFIRMED),
    liquidityState: DataState.DATA_UNAVAILABLE,
    holdersState: DataState.DATA_UNAVAILABLE,
    social: unavailableSocial,
    news: unavailableNews,
  };
}

function signalOf(result: ReturnType<typeof analyzeAdversarial>, type: AdversarialSignalType) {
  const signal = result.signals.find((s) => s.type === type);
  expect(signal, `expected a ${type} signal to always be present`).toBeDefined();
  return signal!;
}

describe("Adversarial Intelligence engine (MANIPULATION_RADAR)", () => {
  it("always reports on every pattern in the taxonomy, so a reader can tell 'checked and absent' from 'never checked'", () => {
    const result = analyzeAdversarial(baseInput());
    const types = result.signals.map((s) => s.type).sort();
    expect(types).toEqual([...new Set(Object.values(AdversarialSignalType))].sort());
  });

  it("never emits an OBSERVED signal without evidence, and never a severity/confidence for an unobserved one", () => {
    const result = analyzeAdversarial(baseInput());
    for (const signal of result.signals) {
      if (signal.status === AdversarialSignalStatus.OBSERVED) {
        expect(signal.evidence.length).toBeGreaterThan(0);
        expect(signal.confidence).not.toBeNull();
        expect(signal.severity).not.toBeNull();
      } else {
        expect(signal.severity).toBeNull();
        expect(signal.confidence).toBeNull();
      }
    }
  });

  it("never uses accusatory vocabulary in any explanation", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 100_000, buys24h: 900, sells24h: 300 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 98_000, buys24h: 200, sells24h: 100 },
      holdersState: DataState.AVAILABLE,
      holders: { top10Pct: 72 },
      social: socialSummary({ mentionVelocity: 4, mentionVelocityChange: 3 }),
      news: newsSummary({ coverageVelocity: 2, coverageVelocityChange: 1.5 }),
    });
    const prose = result.signals.map((s) => s.explanation).join(" ").toLowerCase();
    for (const banned of ["scam", "fraud", "manipulated", "rug", "guaranteed", "caused", "will dump", "proves"]) {
      expect(prose, `explanation must never contain "${banned}"`).not.toContain(banned);
    }
    // And it must actively preserve uncertainty where it claims a pattern.
    expect(prose).toContain("does not distinguish");
  });

  // ---- Test A: social spike with no historical baseline -------------------
  it("A: social activity present but no prior baseline -> INSUFFICIENT_TEMPORAL_DATA, never an acceleration claim", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      history: insufficientHistory,
      social: socialSummary({ mentionVelocity: 12 }), // high, but no mentionVelocityChange -> no baseline
    });
    const social = signalOf(result, AdversarialSignalType.SOCIAL_ACCELERATION);
    expect(social.status).toBe(AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA);
    expect(social.severity).toBeNull();
    expect(social.explanation).toMatch(/first observation is never acceleration/i);
  });

  // ---- Test B: activity spike + flat liquidity + valid history ------------
  it("B: activity accelerates while liquidity stays flat, with real history -> LIQUIDITY_ACTIVITY_MISMATCH with both metrics as evidence", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 101_000, buys24h: 800, sells24h: 400 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
    });
    const mismatch = signalOf(result, AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH);
    expect(mismatch.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(mismatch.evidence.map((e) => e.metric).sort()).toEqual(["liquidityUsd", "tradeCount24h"]);

    const trades = mismatch.evidence.find((e) => e.metric === "tradeCount24h")!;
    expect(trades.previousValue).toBe(300);
    expect(trades.currentValue).toBe(1200);
    expect(trades.delta).toBe(900);
    // The rolling-window caveat must travel with the number, not be buried in docs.
    expect(trades.caveat).toMatch(/rolling 24-hour/i);
  });

  it("B2: activity and liquidity moving together proportionally is NOT_OBSERVED, not a mismatch", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 200_000, buys24h: 400, sells24h: 200 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
    });
    expect(signalOf(result, AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH).status).toBe(AdversarialSignalStatus.NOT_OBSERVED);
  });

  // ---- Test C: high concentration but no activity change ------------------
  it("C: elevated concentration with no activity change produces no adversarial claim", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
      holdersState: DataState.AVAILABLE,
      holders: { top10Pct: 85 },
    });
    const interaction = signalOf(result, AdversarialSignalType.CONCENTRATION_ACTIVITY_INTERACTION);
    expect(interaction.status).toBe(AdversarialSignalStatus.NOT_OBSERVED);
    expect(result.signals.filter((s) => s.status === AdversarialSignalStatus.OBSERVED)).toHaveLength(0);
  });

  it("C2: elevated concentration WITH a material activity change is an interaction, framed as weighting not prediction", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 100_000, buys24h: 900, sells24h: 300 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
      holdersState: DataState.AVAILABLE,
      holders: { top10Pct: 85 },
    });
    const interaction = signalOf(result, AdversarialSignalType.CONCENTRATION_ACTIVITY_INTERACTION);
    expect(interaction.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(interaction.explanation).toMatch(/not a prediction/i);
    expect(interaction.explanation).toMatch(/exchange custody|treasury/i); // ordinary explanations stated
  });

  // ---- Test D: social + on-chain acceleration with valid temporal history --
  it("D: social acceleration alongside on-chain movement -> TEMPORAL_COORDINATION across domains, adjacency only", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      history: comparableHistory({
        trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM }],
      }),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 150_000, buys24h: 900, sells24h: 300 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
      social: socialSummary({ mentionVelocity: 5, mentionVelocityChange: 3 }),
    });
    const temporal = signalOf(result, AdversarialSignalType.TEMPORAL_COORDINATION);
    expect(temporal.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(temporal.explanation).toMatch(/within the same observed time window/i);
    expect(temporal.explanation).toMatch(/does not establish ordering/i);
    expect(temporal.explanation.toLowerCase()).not.toContain("caused");

    const social = signalOf(result, AdversarialSignalType.SOCIAL_ACCELERATION);
    expect(social.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(social.source).toContain("history"); // on-chain corroboration recorded
  });

  it("D2: social acceleration WITHOUT on-chain corroboration says so explicitly", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      social: socialSummary({ mentionVelocity: 5, mentionVelocityChange: 3 }),
    });
    const social = signalOf(result, AdversarialSignalType.SOCIAL_ACCELERATION);
    expect(social.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(social.explanation).toMatch(/on-chain confirmation is limited/i);
    expect(social.source).not.toContain("history");
  });

  // ---- Test E: malformed / unavailable provider data ----------------------
  it("E: malformed or unavailable provider data produces no fabricated signal", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.ERROR,
      liquidity: undefined,
      holdersState: DataState.ERROR,
      holders: undefined,
      social: socialSummary({ dataState: DataState.ERROR }),
      news: newsSummary({ dataState: DataState.ERROR }),
    });
    expect(result.signals.some((s) => s.status === AdversarialSignalStatus.OBSERVED)).toBe(false);
    expect(result.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("E2: a liquidity payload with no buy/sell fields is unavailable, never counted as zero trades", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 100_000 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000 },
    });
    const mismatch = signalOf(result, AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH);
    expect(mismatch.status).toBe(AdversarialSignalStatus.DATA_UNAVAILABLE);
    expect(mismatch.explanation).toMatch(/Unavailable is not zero/i);
  });

  // ---- Test F: identity collision ----------------------------------------
  it("F: ambiguous identity plus weakly-matched external coverage -> IDENTITY_NARRATIVE_CONFLICT only", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      identity: identityOf(IdentityStatus.AMBIGUOUS),
      news: newsSummary({
        storyGroups: [
          {
            representativeTitle: "GME surges",
            firstPublishedAt: NOW,
            memberCount: 1,
            sources: ["example.com"],
            members: [
              {
                source: "example.com",
                title: "GME surges",
                publishedAt: NOW,
                entityMatch: { basis: EntityMatchBasis.SYMBOL_AMBIGUOUS, note: "ticker collision" },
                sourceQuality: SourceQuality.ESTABLISHED_PUBLISHER,
                category: "MARKET_COVERAGE",
              },
            ],
          },
        ],
      }),
    });
    const conflict = signalOf(result, AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT);
    expect(conflict.status).toBe(AdversarialSignalStatus.OBSERVED);
    expect(conflict.explanation).toMatch(/shares a ticker/i);
    expect(conflict.explanation).toMatch(/not about the contract's behavior/i);

    const observedTypes = result.signals.filter((s) => s.status === AdversarialSignalStatus.OBSERVED).map((s) => s.type);
    expect(observedTypes).toEqual([AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT]);
  });

  it("F2: confirmed identity with strong external matches is NOT_OBSERVED", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      identity: identityOf(IdentityStatus.CONFIRMED),
      social: socialSummary({
        observations: [
          {
            source: "x",
            authorId: "a1",
            postedAt: NOW,
            text: "contract 0x1111",
            entityMatch: { basis: EntityMatchBasis.CONTRACT_ADDRESS, note: "address match" },
            sourceQuality: SourceQuality.PUBLIC_SOCIAL,
          },
        ],
      }),
    });
    expect(signalOf(result, AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT).status).toBe(AdversarialSignalStatus.NOT_OBSERVED);
  });

  // ---- Confidence calibration --------------------------------------------
  it("never awards HIGH confidence from a single domain, and reserves it for multi-domain evidence with real history", () => {
    const singleDomain = analyzeAdversarial({
      ...baseInput(),
      social: socialSummary({ mentionVelocity: 5, mentionVelocityChange: 3 }),
    });
    const social = signalOf(singleDomain, AdversarialSignalType.SOCIAL_ACCELERATION);
    expect(social.confidence).not.toBe(Confidence.HIGH);

    const multiDomain = analyzeAdversarial({
      ...baseInput(),
      history: comparableHistory({
        trends: [{ metric: "liquidityUsd", trendType: TrendType.LIQUIDITY_INCREASING, direction: TrendDirection.INCREASING, confidence: Confidence.MEDIUM }],
      }),
      liquidityState: DataState.AVAILABLE,
      liquidity: { liquidityUsd: 150_000, buys24h: 900, sells24h: 300 },
      previousLiquidityState: DataState.AVAILABLE,
      previousLiquidity: { liquidityUsd: 100_000, buys24h: 200, sells24h: 100 },
      social: socialSummary({ mentionVelocity: 5, mentionVelocityChange: 3 }),
      news: newsSummary({ coverageVelocity: 2, coverageVelocityChange: 1.5 }),
    });
    const temporal = signalOf(multiDomain, AdversarialSignalType.TEMPORAL_COORDINATION);
    expect(temporal.confidence).toBe(Confidence.HIGH);
    expect(new Set(temporal.source).size).toBeGreaterThanOrEqual(3);
  });

  // ---- Canonical relationship integration ---------------------------------
  it("adapts only OBSERVED signals into the existing canonical relationship model, never a parallel graph", () => {
    const result = analyzeAdversarial({
      ...baseInput(),
      social: socialSummary({ mentionVelocity: 5, mentionVelocityChange: 3 }),
    });
    const rels = toCanonicalAdversarialRelationships(result, tokenEntity(CHAIN, ADDRESS));
    expect(rels).toHaveLength(result.signals.filter((s) => s.status === AdversarialSignalStatus.OBSERVED).length);
    for (const rel of rels) {
      expect(rel.category).toBe("ADVERSARIAL");
      expect(rel.evidence.length).toBeGreaterThan(0);
      expect(rel.id).toContain("adversarial:");
    }
  });
});

// ---------------------------------------------------------------------------
// Integration against the real report pipeline — Tests G and H.
// ---------------------------------------------------------------------------
function snapshotAt(capturedAt: string, buys: number, liquidityUsd: number): TokenSnapshot {
  const token = { chainId: CHAIN, address: ADDRESS };
  return {
    token,
    capturedAt,
    identity: resolveIdentity([], CHAIN, ADDRESS, [], capturedAt),
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd, buys24h: buys, sells24h: 100 } },
    holders: { state: DataState.DATA_UNAVAILABLE },
  };
}

describe("Adversarial Intelligence in the full report pipeline", () => {
  it("is exposed on the report and never alters marketState or the data-quality score", () => {
    const current = snapshotAt(NOW, 900, 100_000);
    const previous = snapshotAt(PREVIOUS, 200, 100_000);
    const withHistory = buildReport(current, { previousSnapshot: previous });
    const withoutHistory = buildReport(current);

    expect(withHistory.adversarial.signals.length).toBeGreaterThan(0);
    // Same snapshot, different history depth -> adversarial output differs, score/state do not.
    expect(withHistory.score.dataQualityScore).toBe(withoutHistory.score.dataQualityScore);
    expect(withHistory.marketState.state).toBe(withoutHistory.marketState.state);
  });

  it("surfaces observed patterns in the canonical relationship graph under the ADVERSARIAL category", () => {
    const report = buildReport(snapshotAt(NOW, 900, 100_000), { previousSnapshot: snapshotAt(PREVIOUS, 200, 100_000) });
    expect(report.relationshipGraph.categoryCounts.ADVERSARIAL).toBeGreaterThan(0);
    expect(report.relationshipGraph.relationships.some((r) => r.category === "ADVERSARIAL")).toBe(true);
  });

  it("emits a MANIPULATION_SIGNAL_DETECTED event for an observed pattern, and none when nothing is observed", () => {
    const observedReport = buildReport(snapshotAt(NOW, 900, 100_000), { previousSnapshot: snapshotAt(PREVIOUS, 200, 100_000) });
    expect(observedReport.events.events.some((e) => e.eventType === "MANIPULATION_SIGNAL_DETECTED")).toBe(true);

    const quietReport = buildReport(snapshotAt(NOW, 200, 100_000), { previousSnapshot: snapshotAt(PREVIOUS, 200, 100_000) });
    expect(quietReport.events.events.some((e) => e.eventType === "MANIPULATION_SIGNAL_DETECTED")).toBe(false);
  });

  // ---- Test G: same-millisecond scans ------------------------------------
  it("G: two scans sharing an identical millisecond keep existing history semantics and produce no fabricated pattern", () => {
    const sameInstant = buildReport(snapshotAt(NOW, 900, 100_000), { previousSnapshot: snapshotAt(NOW, 200, 100_000) });
    expect(sameInstant.history.status).toBe(HistoryStatus.COMPARABLE);
    // The engine must not crash or invent a window; a zero-length window is still a real comparison.
    expect(sameInstant.adversarial.signals.every((s) => s.observedAt === NOW)).toBe(true);
  });

  // ---- Test H: legacy / malformed history record --------------------------
  it("H: a malformed previous snapshot does not crash the adversarial layer", () => {
    const malformedPrevious = { token: { chainId: CHAIN, address: ADDRESS }, capturedAt: PREVIOUS } as unknown as TokenSnapshot;
    expect(() => buildReport(snapshotAt(NOW, 900, 100_000), { previousSnapshot: malformedPrevious })).not.toThrow();
  });

  it("emits no adversarial event when every pattern is unevaluable, rather than an 'all clear'", () => {
    const bare: TokenSnapshot = {
      token: { chainId: CHAIN, address: ADDRESS },
      capturedAt: NOW,
      identity: resolveIdentity([], CHAIN, ADDRESS, [], NOW),
      contract: { state: DataState.PROVIDER_UNAVAILABLE },
      liquidity: { state: DataState.PROVIDER_UNAVAILABLE },
      holders: { state: DataState.PROVIDER_UNAVAILABLE },
    };
    const report = buildReport(bare);
    expect(report.adversarial.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(report.adversarial.signals.every((s) => s.status !== AdversarialSignalStatus.OBSERVED)).toBe(true);
    expect(report.events.events.some((e) => e.eventType === "MANIPULATION_SIGNAL_DETECTED")).toBe(false);
  });
});
