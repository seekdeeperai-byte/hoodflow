import { DataState, isUsable } from "../types/data-state.js";
import { Confidence, HypeState, type HoodflowReport } from "../types/intelligence.js";
import { TrendDirection, type HistoricalComparison } from "../types/history.js";
import type { NewsSummary, SocialSummary } from "../types/social-news.js";
import {
  CrossSourceDomain,
  CrossSourceRelationshipType,
  TemporalSequenceStatus,
  type CrossSourceIntelligence,
  type CrossSourceRelationship,
  type TemporalCrossSourceObservation,
} from "../types/cross-source.js";

/**
 * Cross-Source Relationship Engine (governing spec §6-8) — a THIRD engine,
 * deliberately separate from relationships/relationship-engine.ts (combines
 * same-snapshot Signals) and historical/temporal-relationship-engine.ts
 * (combines cross-scan Trends). Its input — on-chain trend direction +
 * social + news + attention summaries, four structurally different domains
 * — doesn't fit either existing engine's Signal[]/Trend[] shape.
 *
 * Every interpretation stays inside the same non-causal vocabulary already
 * enforced in temporal-relationship-engine.ts: "coincides with", "occurred
 * alongside", "preceded", "followed", "aligned with", "diverged from", "no
 * relationship measurable" — never "caused". Confidence is capped at MEDIUM
 * unless three independently-sourced domains agree (see
 * MULTI_SOURCE_CONVERGENCE below) — never HIGH from one weak source (§7).
 */

export interface CrossSourceInput {
  now: string;
  social: SocialSummary;
  news: NewsSummary;
  hype: HoodflowReport["hype"];
  history: HistoricalComparison;
}

interface DirectionRead {
  usable: boolean;
  rising: boolean;
  falling: boolean;
}

function onchainDirection(history: HistoricalComparison): DirectionRead {
  if (history.status !== "COMPARABLE") return { usable: false, rising: false, falling: false };
  const liquidity = history.trends.find((t) => t.metric === "liquidityUsd");
  const holders = history.trends.find((t) => t.metric === "holderCount");
  const relevant = [liquidity, holders].filter((t): t is NonNullable<typeof t> => t !== undefined);
  if (relevant.length === 0) return { usable: false, rising: false, falling: false };
  return {
    usable: true,
    rising: relevant.some((t) => t.direction === TrendDirection.INCREASING),
    falling: relevant.some((t) => t.direction === TrendDirection.DECREASING),
  };
}

function socialDirection(social: SocialSummary): DirectionRead {
  if (!isUsable(social.dataState) || social.mentionVelocityChange === undefined) {
    return { usable: false, rising: false, falling: false };
  }
  return { usable: true, rising: social.mentionVelocityChange > 0, falling: social.mentionVelocityChange < 0 };
}

function newsHasCoverage(news: NewsSummary): { usable: boolean; hasCoverage: boolean } {
  if (!isUsable(news.dataState) || news.storyCount === undefined) return { usable: false, hasCoverage: false };
  return { usable: true, hasCoverage: news.storyCount > 0 };
}

function attentionDirection(hype: HoodflowReport["hype"]): { usable: boolean; rising: boolean; falling: boolean; quiet: boolean } {
  if (hype.state === HypeState.UNKNOWN) return { usable: false, rising: false, falling: false, quiet: false };
  return {
    usable: true,
    rising: hype.state === HypeState.ACCELERATING || hype.state === HypeState.EXTREME_ATTENTION || hype.state === HypeState.HIGH_ATTENTION,
    falling: hype.state === HypeState.COOLING,
    quiet: hype.state === HypeState.QUIET,
  };
}

export function analyzeCrossSource(input: CrossSourceInput): CrossSourceIntelligence {
  const { now, social, news, hype, history } = input;
  const onchain = onchainDirection(history);
  const soc = socialDirection(social);
  const newsRead = newsHasCoverage(news);
  const attn = attentionDirection(hype);

  const usableDomainCount = [onchain.usable, soc.usable, newsRead.usable, attn.usable].filter(Boolean).length;
  const relationships: CrossSourceRelationship[] = [];
  const limitations: string[] = [];

  if (!onchain.usable) {
    limitations.push(
      history.status === "INSUFFICIENT_HISTORY"
        ? "On-chain trend direction is unavailable for cross-source comparison — this is only the first recorded scan of this token, so there is no prior on-chain observation to compare against."
        : "On-chain trend direction is unavailable for cross-source comparison (no liquidity/holder trend could be computed).",
    );
  }
  if (!soc.usable) limitations.push("Social attention direction is unavailable for cross-source comparison (social data unavailable, or no prior scan to compute a velocity change from).");
  if (!newsRead.usable) limitations.push("News coverage is unavailable for cross-source comparison.");
  if (!attn.usable) limitations.push("Attention/hype classification is unavailable for cross-source comparison.");

  if (usableDomainCount < 2) {
    relationships.push({
      relationshipType: CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA,
      observedAt: now,
      sourcesInvolved: [],
      evidence: [],
      confidence: Confidence.LOW,
      interpretation:
        "Fewer than two independent data domains (on-chain, social, news, attention) had usable data in this scan — no cross-source relationship can be measured. This is not evidence of alignment or divergence; it is simply unmeasured.",
      dataState: DataState.DATA_UNAVAILABLE,
    });
    return { dataState: DataState.DATA_UNAVAILABLE, relationships, temporalAnalysis: [buildTemporalAnalysis(input, onchain)], limitations };
  }

  // ONCHAIN_SOCIAL_ALIGNMENT / DIVERGENCE
  if (onchain.usable && soc.usable) {
    const aligned = (onchain.rising && soc.rising) || (onchain.falling && soc.falling);
    const diverged = (onchain.rising && soc.falling) || (onchain.falling && soc.rising);
    if (aligned || diverged) {
      relationships.push({
        relationshipType: aligned ? CrossSourceRelationshipType.ONCHAIN_SOCIAL_ALIGNMENT : CrossSourceRelationshipType.ONCHAIN_SOCIAL_DIVERGENCE,
        observedAt: now,
        sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL],
        evidence: [
          `On-chain liquidity/holder trend direction: ${onchain.rising ? "increasing" : "decreasing"}.`,
          `Social mention velocity ${soc.rising ? "increased" : "decreased"} versus the previous scan.`,
        ],
        confidence: Confidence.MEDIUM,
        interpretation: aligned
          ? "Social attention direction is aligned with the on-chain liquidity/holder trend over the same observation window."
          : "Social attention direction diverged from the on-chain liquidity/holder trend over the same observation window — the two sources do not agree.",
        dataState: DataState.AVAILABLE,
      });
    }
  }

  // ONCHAIN_NEWS_ALIGNMENT (coarse: presence of coverage alongside a rising on-chain trend)
  if (onchain.usable && newsRead.usable && newsRead.hasCoverage && onchain.rising) {
    relationships.push({
      relationshipType: CrossSourceRelationshipType.ONCHAIN_NEWS_ALIGNMENT,
      observedAt: now,
      sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.NEWS],
      evidence: [
        "On-chain liquidity/holder trend direction: increasing.",
        `News coverage was present in the same observation window (${news.storyCount} distinct stor${news.storyCount === 1 ? "y" : "ies"}).`,
      ],
      confidence: Confidence.MEDIUM,
      interpretation: "News coverage occurred alongside a rising on-chain liquidity/holder trend over the same observation window.",
      dataState: DataState.AVAILABLE,
    });
  }

  // SOCIAL_NEWS_ALIGNMENT (both channels show, or both show no, activity)
  if (soc.usable && newsRead.usable) {
    const socialHasActivity = (social.postCount ?? 0) > 0;
    if (socialHasActivity === newsRead.hasCoverage) {
      relationships.push({
        relationshipType: CrossSourceRelationshipType.SOCIAL_NEWS_ALIGNMENT,
        observedAt: now,
        sourcesInvolved: [CrossSourceDomain.SOCIAL, CrossSourceDomain.NEWS],
        evidence: [
          `Social: ${social.postCount ?? 0} matching post(s) observed.`,
          `News: ${news.storyCount ?? 0} distinct stor${(news.storyCount ?? 0) === 1 ? "y" : "ies"} observed.`,
        ],
        confidence: Confidence.MEDIUM,
        interpretation: socialHasActivity
          ? "Social and news activity both show measurable coverage of this token in the same observation window — two independent sources converge."
          : "Neither social nor news activity showed measurable coverage of this token in the same observation window.",
        dataState: DataState.AVAILABLE,
      });
    }
  }

  // ATTENTION_LIQUIDITY_DIVERGENCE (attention rising without liquidity backing — spec example D)
  if (attn.usable && onchain.usable) {
    const liquidityTrend = history.trends.find((t) => t.metric === "liquidityUsd");
    if (attn.rising && liquidityTrend !== undefined && liquidityTrend.direction !== TrendDirection.INCREASING) {
      relationships.push({
        relationshipType: CrossSourceRelationshipType.ATTENTION_LIQUIDITY_DIVERGENCE,
        observedAt: now,
        sourcesInvolved: [CrossSourceDomain.ATTENTION, CrossSourceDomain.ONCHAIN],
        evidence: [
          `Attention/hype state: ${hype.state}.`,
          `Pooled liquidity trend over the same window: ${liquidityTrend.direction.toLowerCase()}.`,
        ],
        confidence: Confidence.MEDIUM,
        interpretation:
          "Attention is elevated or rising while pooled liquidity is not growing in proportion — attention observed here is not currently backed by growing on-chain liquidity.",
        dataState: DataState.AVAILABLE,
      });
    }
  }

  // ATTENTION_ACTIVITY_ALIGNMENT (blended social+news attention vs. on-chain activity trend)
  if (attn.usable && onchain.usable && !attn.quiet) {
    const aligned = (attn.rising && onchain.rising) || (attn.falling && onchain.falling);
    if (aligned) {
      relationships.push({
        relationshipType: CrossSourceRelationshipType.ATTENTION_ACTIVITY_ALIGNMENT,
        observedAt: now,
        sourcesInvolved: [CrossSourceDomain.ATTENTION, CrossSourceDomain.ONCHAIN],
        evidence: [`Attention/hype state: ${hype.state}.`, `On-chain liquidity/holder trend direction: ${onchain.rising ? "increasing" : "decreasing"}.`],
        confidence: Confidence.MEDIUM,
        interpretation: "Attention dynamics are aligned with the on-chain activity trend over the same observation window.",
        dataState: DataState.AVAILABLE,
      });
    }
  }

  // MULTI_SOURCE_CONVERGENCE / DIVERGENCE (all three of on-chain, social, news usable)
  if (onchain.usable && soc.usable && newsRead.usable) {
    const directions = [onchain.rising, soc.rising, newsRead.hasCoverage];
    const allRising = directions.every(Boolean);
    const allQuiet = !onchain.rising && !soc.rising && !newsRead.hasCoverage && !onchain.falling && !soc.falling;
    if (allRising || allQuiet) {
      relationships.push({
        relationshipType: CrossSourceRelationshipType.MULTI_SOURCE_CONVERGENCE,
        observedAt: now,
        sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL, CrossSourceDomain.NEWS],
        evidence: [
          `On-chain trend: ${onchain.rising ? "increasing" : onchain.falling ? "decreasing" : "flat"}.`,
          `Social mention velocity: ${soc.rising ? "increasing" : soc.falling ? "decreasing" : "flat"}.`,
          `News coverage present: ${newsRead.hasCoverage}.`,
        ],
        // Three independently-sourced, usable domains agreeing is the one case this engine
        // allows HIGH confidence — never from a single weak source (§7).
        confidence: Confidence.HIGH,
        interpretation: allRising
          ? "On-chain activity, social attention, and news coverage all increased over the same observation window — three independent sources converge."
          : "On-chain activity, social attention, and news coverage all show no notable change over the same observation window — three independent sources agree on a quiet period.",
        dataState: DataState.AVAILABLE,
      });
    } else {
      const risingCount = directions.filter(Boolean).length;
      if (risingCount > 0 && risingCount < 3) {
        relationships.push({
          relationshipType: CrossSourceRelationshipType.MULTI_SOURCE_DIVERGENCE,
          observedAt: now,
          sourcesInvolved: [CrossSourceDomain.ONCHAIN, CrossSourceDomain.SOCIAL, CrossSourceDomain.NEWS],
          evidence: [
            `On-chain trend: ${onchain.rising ? "increasing" : onchain.falling ? "decreasing" : "flat"}.`,
            `Social mention velocity: ${soc.rising ? "increasing" : soc.falling ? "decreasing" : "flat"}.`,
            `News coverage present: ${newsRead.hasCoverage}.`,
          ],
          confidence: Confidence.MEDIUM,
          interpretation: "On-chain, social, and news sources do not all agree over the same observation window — at least one source diverges from the others.",
          dataState: DataState.AVAILABLE,
        });
      }
    }
  }

  if (relationships.length === 0) {
    relationships.push({
      relationshipType: CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA,
      observedAt: now,
      sourcesInvolved: [],
      evidence: [],
      confidence: Confidence.LOW,
      interpretation:
        "Multiple data domains had usable data, but none of the defined cross-source relationship patterns were met this scan — no relationship is reported rather than a forced one.",
      dataState: DataState.PARTIAL,
    });
  }

  const dataState = relationships.some((r) => r.relationshipType !== CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA)
    ? DataState.AVAILABLE
    : DataState.PARTIAL;

  return { dataState, relationships, temporalAnalysis: [buildTemporalAnalysis(input, onchain)], limitations };
}

/**
 * Temporal Cross-Source Analysis (§8): did social/news activity occur in the
 * earlier or later half of the on-chain comparison window? Requires real
 * per-observation timestamps and a COMPARABLE two-point on-chain history —
 * without both, this always and honestly returns INSUFFICIENT_TEMPORAL_DATA
 * rather than inferring a sequence from aggregate totals alone (§8's own
 * requirement).
 */
function buildTemporalAnalysis(input: CrossSourceInput, onchain: DirectionRead): TemporalCrossSourceObservation {
  const { history, social } = input;
  if (!onchain.usable || history.previousObservedAt === null || social.observationWindowEnd === undefined) {
    return {
      status: TemporalSequenceStatus.INSUFFICIENT_TEMPORAL_DATA,
      description:
        "Insufficient timestamp resolution to determine which signal appeared first — this requires a comparable two-point on-chain history plus timestamped social/news observations.",
    };
  }

  const windowStartMs = Date.parse(history.previousObservedAt);
  const windowEndMs = Date.parse(history.currentObservedAt);
  const socialEndMs = Date.parse(social.observationWindowEnd);
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || !Number.isFinite(socialEndMs) || windowEndMs <= windowStartMs) {
    return {
      status: TemporalSequenceStatus.INSUFFICIENT_TEMPORAL_DATA,
      description: "Insufficient timestamp resolution to determine which signal appeared first.",
    };
  }

  const windowMidMs = (windowStartMs + windowEndMs) / 2;
  if (socialEndMs < windowMidMs && onchain.rising) {
    const lagHours = Math.round(((windowEndMs - socialEndMs) / (1000 * 60 * 60)) * 10) / 10;
    return {
      status: TemporalSequenceStatus.MEASURED,
      leadingDomain: CrossSourceDomain.SOCIAL,
      laggingDomain: CrossSourceDomain.ONCHAIN,
      lagDescription: `approximately ${lagHours} hour(s)`,
      description: `Social attention activity was observed to end in the earlier half of the comparison window, approximately ${lagHours} hour(s) before the on-chain increase was measured at the end of the window.`,
    };
  }

  return {
    status: TemporalSequenceStatus.INSUFFICIENT_TEMPORAL_DATA,
    description: "Available timestamps do not clearly place social/news activity before or after the on-chain change within this window.",
  };
}
