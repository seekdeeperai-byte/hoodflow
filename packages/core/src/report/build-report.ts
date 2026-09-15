import { analyzeContract } from "../analyzers/contract-analyzer.js";
import { analyzeLiquidity } from "../analyzers/liquidity-analyzer.js";
import { analyzeHolders } from "../analyzers/holders-analyzer.js";
import { analyzeIdentity } from "../analyzers/identity-analyzer.js";
import { DataState, isUsable } from "../types/data-state.js";
import { IdentityStatus } from "../types/identity.js";
import { HistoryStatus } from "../types/history.js";
import type { TokenSnapshot } from "../types/domain.js";
import { buildEvidence } from "../evidence/evidence-engine.js";
import { buildContractInterpretation, buildInterpretations } from "../interpretation/interpretation-engine.js";
import { selectMarketState } from "../interpretation/market-state.js";
import { detectRelationships } from "../relationships/relationship-engine.js";
import { buildHistoricalComparison } from "../historical/build-history.js";
import { buildHistoricalSignals } from "../historical/historical-signals.js";
import { Confidence, HypeState, type HoodflowReport, type Signal } from "../types/intelligence.js";
import { assessFreshness } from "../freshness.js";

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
export interface BuildReportOptions {
  /**
   * The most recent prior scan of this exact token (chain + normalized
   * address), when one exists — from HistoryStore.getPreviousSnapshot(),
   * passed through unchanged. Supersedes the Phase 0-5 `previousHolderCount`
   * option (removed this phase): holder growth is now derived from this
   * same snapshot internally, so callers have one previous-state input
   * instead of two. See docs/HISTORICAL_INTELLIGENCE.md.
   */
  previousSnapshot?: TokenSnapshot;
  servedAt?: string;
}

export function buildReport(snapshot: TokenSnapshot, options: BuildReportOptions = {}): HoodflowReport {
  const servedAt = options.servedAt ?? new Date().toISOString();
  const signals: Signal[] = [];
  const limitations: string[] = [];
  const previousHolderCount = options.previousSnapshot?.holders.data?.holderCount;

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

  if (isUsable(snapshot.holders.state) && snapshot.holders.data) {
    signals.push(...analyzeHolders(snapshot.holders.data, previousHolderCount, snapshot.capturedAt));
    if (previousHolderCount === undefined) {
      limitations.push(
        "Holder growth is unavailable — no prior snapshot exists to compare against yet (see docs/HISTORICAL_INTELLIGENCE.md). This is not the same as holder growth being flat; it is simply unmeasured.",
      );
    }
  } else {
    limitations.push(`Holder distribution data unavailable (${snapshot.holders.state}).`);
  }

  // Captured here, BEFORE identity or historical limitations are considered below: the
  // existing overallConfidencePenalty semantics (Phase 0-4) are driven only by
  // contract/liquidity/holders availability, and neither Phase 5 (identity) nor Phase 6
  // (history) may silently change that — both are informational, never a
  // score/confidence-penalty input (Phase 5 §5: "Identity information must not
  // automatically become a score component"; Phase 6 §24: "Absence of history is not
  // evidence of risk"). See docs/IDENTITY_RESOLUTION.md and
  // docs/HISTORICAL_INTELLIGENCE.md, both "Score integrity".
  const marketLimitationsCount = limitations.length;

  // Relationships/evidence/market-state are computed from market signals ONLY
  // (contract/liquidity/holders, collected above) — identity signals are added
  // to the report's `signals` array afterward, deliberately AFTER this point,
  // so they never enter detectRelationships()/buildEvidence()'s contradiction
  // sweep or influence marketState/dataQualityScore. Identity risk stays
  // conceptually separate from contract/market risk (Phase 5 §5, §24) —
  // see docs/IDENTITY_RESOLUTION.md.
  const relationships = detectRelationships(signals);
  const evidence = buildEvidence(relationships, signals);
  const interpretations = buildInterpretations(relationships, evidence);
  const contractInterpretation = buildContractInterpretation(signals);
  if (contractInterpretation) interpretations.unshift(contractInterpretation);

  const marketState = selectMarketState(signals, relationships);

  signals.push(...analyzeIdentity(snapshot.identity, snapshot.capturedAt));
  switch (snapshot.identity.status) {
    case IdentityStatus.UNVERIFIED:
      limitations.push(
        "This contract address is not in HOODFLOW's known-token registry — identity could not be cross-checked. This is not a negative finding; the registry is small.",
      );
      break;
    case IdentityStatus.AMBIGUOUS:
      limitations.push(
        "Name/symbol context for this token overlaps with more than one distinct known contract on this chain — identity is ambiguous from available evidence.",
      );
      break;
    case IdentityStatus.CONFLICTING:
      limitations.push(
        "Contextual identity information (name/symbol) for this token conflicts with contract-level identity evidence — see the IDENTITY_MISMATCH signal for detail. Contract address remains the authoritative identifier.",
      );
      break;
    case IdentityStatus.UNAVAILABLE:
      limitations.push("Identity resolution could not run for this address.");
      break;
    case IdentityStatus.CONFIRMED:
      break; // no limitation — this is the fully-resolved case
  }

  // Phase 6: historical comparison against the single immediately-previous scan of this
  // exact token, when one exists. Pure/no I/O (packages/core/src/historical/). Its signals
  // are appended AFTER the market sweep above, same placement/reasoning as identity
  // signals: informational, never an input to marketState or dataQualityScore.
  const history = buildHistoricalComparison(snapshot, options.previousSnapshot);
  signals.push(...buildHistoricalSignals(history.comparisons, snapshot.capturedAt));
  if (history.status === HistoryStatus.INSUFFICIENT_HISTORY) {
    limitations.push(
      "Historical comparison is unavailable — no prior scan exists yet for this token (see docs/HISTORICAL_INTELLIGENCE.md). This is not evidence of stability or risk; it is simply unmeasured.",
    );
  }

  return {
    token: snapshot.token,
    generatedAt: snapshot.capturedAt,
    dataFreshness: assessFreshness(snapshot.capturedAt, servedAt),
    identity: snapshot.identity,
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
        marketLimitationsCount >= 2 ? Confidence.LOW : marketLimitationsCount === 1 ? Confidence.MEDIUM : null,
    },
    history,
    limitations: [
      ...limitations,
      "Social and news intelligence are not yet implemented — see docs/ROADMAP.md. social/news fields are always DATA_UNAVAILABLE in this build.",
    ],
  } satisfies HoodflowReport;
}
