import { TemporalRelationshipType, TrendDirection, TrendType, type TemporalRelationship, type Trend } from "../types/history.js";
import { Confidence } from "../types/intelligence.js";

function directionOf(trends: Trend[], metric: string): TrendDirection | undefined {
  return trends.find((t) => t.metric === metric)?.direction;
}

const UP = TrendDirection.INCREASING;
const DOWN = TrendDirection.DECREASING;

/**
 * A small, deliberately non-exhaustive set of cross-metric temporal
 * relationships (Phase 6 §18 — "the most important part of Phase 6").
 *
 * Deliberately a separate, small engine from
 * relationships/relationship-engine.ts rather than an extension of it: that
 * engine combines same-snapshot Signals; this one combines cross-snapshot
 * Trends, a structurally different input. Keeping them apart means neither
 * can accidentally influence the other's output, and — critically —
 * neither influences marketState/score.dataQualityScore (see
 * report/build-report.ts's Phase 6 wiring and docs/HISTORICAL_INTELLIGENCE.md
 * "Score integrity").
 *
 * Only fires when the relevant trends are actually known (never guesses
 * from missing data — a metric with no Trend entry simply can't
 * participate). Never claims causation: interpretations use only
 * "coincided with" / "occurred alongside" / "the observed data shows"
 * language, never "caused" / "will cause" / "guarantees" / "proves".
 *
 * The two three-way patterns are checked first and, when one matches, are
 * returned alone — they already subsume what the corresponding two-way
 * relationships would otherwise separately claim about the same two data
 * points, so emitting both would be a redundant, not an additional, claim.
 */
export function detectTemporalRelationships(trends: Trend[]): TemporalRelationship[] {
  const liq = directionOf(trends, "liquidityUsd");
  const holder = directionOf(trends, "holderCount");
  const conc = directionOf(trends, "top10Pct");

  if (liq === UP && holder === UP && conc === DOWN) {
    return [
      {
        relationshipType: TemporalRelationshipType.BROAD_BASED_LIQUIDITY_GROWTH,
        confidence: Confidence.MEDIUM,
        supportingTrends: [TrendType.LIQUIDITY_INCREASING, TrendType.HOLDER_COUNT_INCREASING, TrendType.CONCENTRATION_DECREASING],
        evidence: [
          "Liquidity increased between the previous and current observation.",
          "Holder count increased over the same period.",
          "Top-10 holder concentration decreased over the same period.",
        ],
        interpretation:
          "Liquidity and holder participation increased while ownership concentration declined between observations. " +
          "The observed data shows broadening participation coincided with liquidity growth over this period.",
      },
    ];
  }

  if (liq === UP && conc === UP && holder !== UP) {
    return [
      {
        relationshipType: TemporalRelationshipType.CONCENTRATED_LIQUIDITY_GROWTH,
        confidence: Confidence.MEDIUM,
        supportingTrends: [TrendType.LIQUIDITY_INCREASING, TrendType.CONCENTRATION_INCREASING],
        evidence: [
          "Liquidity increased between the previous and current observation.",
          "Top-10 holder concentration also increased over the same period.",
          holder === DOWN ? "Holder count decreased over the same period." : "Holder count did not increase over the same period.",
        ],
        interpretation:
          "Liquidity increased while ownership concentration also increased and holder participation did not keep pace. " +
          "The observed data shows this liquidity growth occurred alongside narrowing, not broad-based, participation over this period.",
      },
    ];
  }

  const relationships: TemporalRelationship[] = [];

  if (liq !== undefined && holder !== undefined && liq !== TrendDirection.UNCHANGED && holder !== TrendDirection.UNCHANGED) {
    const liqTrend = liq === UP ? TrendType.LIQUIDITY_INCREASING : TrendType.LIQUIDITY_DECREASING;
    const holderTrend = holder === UP ? TrendType.HOLDER_COUNT_INCREASING : TrendType.HOLDER_COUNT_DECREASING;
    if (liq === holder) {
      relationships.push({
        relationshipType: TemporalRelationshipType.LIQUIDITY_PARTICIPATION_ALIGNMENT,
        confidence: Confidence.MEDIUM,
        supportingTrends: [liqTrend, holderTrend],
        evidence: [
          `Liquidity ${liq === UP ? "increased" : "decreased"} between observations.`,
          `Holder count ${holder === UP ? "increased" : "decreased"} over the same period.`,
        ],
        interpretation: `Liquidity and holder count moved in the same direction (both ${liq === UP ? "increasing" : "decreasing"}) between observations. The observed data shows these changes occurred together.`,
      });
    } else {
      relationships.push({
        relationshipType: TemporalRelationshipType.LIQUIDITY_PARTICIPATION_DIVERGENCE,
        confidence: Confidence.MEDIUM,
        supportingTrends: [liqTrend, holderTrend],
        evidence: [
          `Liquidity ${liq === UP ? "increased" : "decreased"} between observations.`,
          `Holder count ${holder === UP ? "increased" : "decreased"} over the same period, moving in the opposite direction.`,
        ],
        interpretation: `Liquidity and holder count moved in opposite directions between observations (liquidity ${liq === UP ? "up" : "down"}, holders ${holder === UP ? "up" : "down"}). The observed data shows these metrics diverging over this period.`,
      });
    }
  }

  if (holder !== undefined && conc !== undefined && holder !== TrendDirection.UNCHANGED && conc !== TrendDirection.UNCHANGED && holder !== conc) {
    const holderTrend = holder === UP ? TrendType.HOLDER_COUNT_INCREASING : TrendType.HOLDER_COUNT_DECREASING;
    const concTrend = conc === UP ? TrendType.CONCENTRATION_INCREASING : TrendType.CONCENTRATION_DECREASING;
    relationships.push({
      relationshipType: TemporalRelationshipType.PARTICIPATION_CONCENTRATION_DIVERGENCE,
      confidence: Confidence.MEDIUM,
      supportingTrends: [holderTrend, concTrend],
      evidence: [
        `Holder count ${holder === UP ? "increased" : "decreased"} between observations.`,
        `Top-10 holder concentration ${conc === UP ? "increased" : "decreased"} over the same period, moving in the opposite direction.`,
      ],
      interpretation:
        holder === UP
          ? "Holder count increased while ownership concentration decreased between observations. The observed data shows participation broadened over this period."
          : "Holder count decreased while ownership concentration increased between observations. The observed data shows participation narrowed over this period.",
    });
  }

  return relationships;
}
