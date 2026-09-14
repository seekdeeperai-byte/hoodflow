import { analyzeContract } from "../analyzers/contract-analyzer.js";
import { analyzeLiquidity } from "../analyzers/liquidity-analyzer.js";
import { DataState, isUsable } from "../types/data-state.js";
import type { TokenSnapshot } from "../types/domain.js";
import { buildEvidence } from "../evidence/evidence-engine.js";
import { buildContractInterpretation, buildInterpretations } from "../interpretation/interpretation-engine.js";
import { selectMarketState } from "../interpretation/market-state.js";
import { detectRelationships } from "../relationships/relationship-engine.js";
import { Confidence, HypeState, type HoodflowReport, type Signal } from "../types/intelligence.js";

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function dataQualityScore(snapshot: TokenSnapshot): number {
  const domains = [snapshot.contract.state, snapshot.liquidity.state, snapshot.holders.state];
  const usable = domains.filter(isUsable).length;
  return Math.round((usable / domains.length) * 100);
}

/**
 * Runs the full pipeline (analyzers -> signals -> relationships -> evidence
 * -> interpretation -> report) over a single normalized snapshot. This is
 * the function the API route calls; it never talks to providers directly.
 */
export function buildReport(snapshot: TokenSnapshot): HoodflowReport {
  const signals: Signal[] = [];
  const limitations: string[] = [];

  if (isUsable(snapshot.contract.state) && snapshot.contract.data) {
    signals.push(...analyzeContract(snapshot.contract.data, snapshot.capturedAt));
  } else {
    limitations.push(`Contract security data unavailable (${snapshot.contract.state}).`);
  }

  if (isUsable(snapshot.liquidity.state) && snapshot.liquidity.data) {
    signals.push(...analyzeLiquidity(snapshot.liquidity.data, snapshot.capturedAt));
  } else {
    limitations.push(`Liquidity/market data unavailable (${snapshot.liquidity.state}).`);
  }

  if (!isUsable(snapshot.holders.state)) {
    limitations.push(`Holder distribution data unavailable (${snapshot.holders.state}).`);
  }

  const relationships = detectRelationships(signals);
  const evidence = buildEvidence(relationships, signals);
  const interpretations = buildInterpretations(relationships, evidence);
  const contractInterpretation = buildContractInterpretation(signals);
  if (contractInterpretation) interpretations.unshift(contractInterpretation);

  const marketState = selectMarketState(signals, relationships);

  return {
    token: snapshot.token,
    generatedAt: snapshot.capturedAt,
    score: { dataQualityScore: dataQualityScore(snapshot) },
    marketState,
    signals,
    relationships,
    interpretations,
    hype: { score: null, state: HypeState.UNKNOWN, quality: "UNKNOWN", confirmation: "UNKNOWN" },
    social: { state: DataState.DATA_UNAVAILABLE },
    news: { state: DataState.DATA_UNAVAILABLE },
    dataQuality: {
      contract: snapshot.contract.state,
      liquidity: snapshot.liquidity.state,
      holders: snapshot.holders.state,
      social: DataState.DATA_UNAVAILABLE,
      news: DataState.DATA_UNAVAILABLE,
      overallConfidencePenalty:
        limitations.length >= 2 ? Confidence.LOW : limitations.length === 1 ? Confidence.MEDIUM : null,
    },
    limitations: [
      ...limitations,
      "Social and news intelligence are not yet implemented (Phase 5) — social/news fields are always DATA_UNAVAILABLE in this build.",
      "Liquidity signals in this build are single-snapshot ratios (market cap/volume vs. liquidity), not growth-over-time; historical intelligence (Phase 4) will add trend-based liquidity signals once repeated scans accumulate.",
    ],
  } satisfies HoodflowReport;
}
