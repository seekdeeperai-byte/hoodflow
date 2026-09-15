/**
 * Historical intelligence types (Phase 6).
 *
 * Answers "what changed?" and "what changed together?" on top of the
 * existing HistoryStore (Phase 4) and identity resolution (Phase 5) — never
 * a replacement for either. See docs/HISTORICAL_INTELLIGENCE.md for the
 * full design rationale.
 *
 * Same inline-import style as identity.ts (`import("./intelligence.js").X`)
 * rather than a top-level `import` statement, so this file has no runtime
 * dependency edge toward intelligence.ts even though intelligence.ts's
 * `HoodflowReport` references types from here — avoids a circular module
 * dependency between the two by construction, not by convention.
 */

export const DeltaStatus = {
  /** Current value is higher than the previous value, beyond the noise threshold. */
  INCREASED: "INCREASED",
  /** Current value is lower than the previous value, beyond the noise threshold. */
  DECREASED: "DECREASED",
  /** Both values are known and comparable, but the change is within the noise threshold. */
  UNCHANGED: "UNCHANGED",
  /** A previous scan exists, but this specific metric lacks a usable value on one or both sides. Never treated as zero or as "no change." */
  UNAVAILABLE: "UNAVAILABLE",
  /** No previous scan exists for this token at all — there is nothing to compare against yet. Never manufactured as UNCHANGED/flat. */
  INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY",
  /** Both values are present but a meaningful comparison isn't well-defined (e.g. a value outside its physically valid range). Defensive, not expected in normal operation. */
  NOT_COMPARABLE: "NOT_COMPARABLE",
} as const;
export type DeltaStatus = (typeof DeltaStatus)[keyof typeof DeltaStatus];

/**
 * One metric's comparison between the previous and current observation.
 * This is also HOODFLOW's "historical evidence" record (Phase 6 §17): it
 * always preserves the previous/current value, both timestamps, the
 * calculated delta, and a comparison status — never invented, never
 * inferred past what the two observations actually contained.
 */
export interface MetricDelta {
  /** Domain field name this delta covers, e.g. "liquidityUsd", "holderCount", "top10Pct". */
  metric: string;
  status: DeltaStatus;
  previousValue: number | null;
  currentValue: number | null;
  previousObservedAt: string | null;
  currentObservedAt: string;
  absoluteChange: number | null;
  /** Relative percentage change — only meaningful for amount-style metrics (liquidity, holder count). Never confused with percentagePointChange. */
  percentChange: number | null;
  /** Percentage-point change — only meaningful for metrics that are themselves already percentages (e.g. top10Pct). Never confused with percentChange. */
  percentagePointChange: number | null;
  /** MEDIUM at most: a single prior-scan comparison, never a smoothed trend — same convention as holders-analyzer.ts's existing HOLDER_GROWTH signal. Null when there is nothing to be confident about. */
  confidence: import("./intelligence.js").Confidence | null;
  /** Factual, non-inferred explanation for a non-COMPARABLE status. Never fabricates a reason that isn't directly observable from the two DataStates involved. */
  note?: string;
}

export const HistoryStatus = {
  /** A previous scan exists for this token; comparisons/trends/relationships may contain real values. */
  COMPARABLE: "COMPARABLE",
  /** No previous scan exists for this token yet. Never treated as a negative finding. */
  INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY",
} as const;
export type HistoryStatus = (typeof HistoryStatus)[keyof typeof HistoryStatus];

/**
 * Purely the mathematical direction of a metric's own change — NOT a
 * risk-valence judgment. Deliberately a separate type from
 * `types/intelligence.ts`'s `Direction` (POSITIVE/NEGATIVE/NEUTRAL), which
 * *is* a risk-valence judgment (e.g. TOP10_CONCENTRATION uses NEGATIVE for
 * "elevated/bad"). Concentration increasing is DECREASING-favorable
 * numerically-neutral information here; whether that's good or bad is
 * decided separately, only when building a Signal (see
 * historical/historical-signals.ts), never here.
 */
export const TrendDirection = {
  INCREASING: "INCREASING",
  DECREASING: "DECREASING",
  UNCHANGED: "UNCHANGED",
} as const;
export type TrendDirection = (typeof TrendDirection)[keyof typeof TrendDirection];

export const TrendType = {
  LIQUIDITY_INCREASING: "LIQUIDITY_INCREASING",
  LIQUIDITY_DECREASING: "LIQUIDITY_DECREASING",
  HOLDER_COUNT_INCREASING: "HOLDER_COUNT_INCREASING",
  HOLDER_COUNT_DECREASING: "HOLDER_COUNT_DECREASING",
  CONCENTRATION_INCREASING: "CONCENTRATION_INCREASING",
  CONCENTRATION_DECREASING: "CONCENTRATION_DECREASING",
  /** Emitted when a metric was actually comparable but the change fell within the noise threshold. A real conclusion ("no significant change"), not a stand-in for missing data. */
  NO_TREND: "NO_TREND",
} as const;
export type TrendType = (typeof TrendType)[keyof typeof TrendType];

export interface Trend {
  metric: string;
  trendType: TrendType;
  direction: TrendDirection;
  confidence: import("./intelligence.js").Confidence;
}

/**
 * A small, deliberately non-exhaustive set of cross-metric temporal
 * relationships (Phase 6 §18 — "the most important part of Phase 6").
 * Kept as its own type, distinct from `types/intelligence.ts`'s
 * `RelationshipType`, because these combine Trends (cross-snapshot), not
 * Signals (single-snapshot) — see relationships/relationship-engine.ts vs
 * historical/temporal-relationship-engine.ts. Never claims causation.
 */
export const TemporalRelationshipType = {
  /** Liquidity and holder count moved in the same direction between observations. */
  LIQUIDITY_PARTICIPATION_ALIGNMENT: "LIQUIDITY_PARTICIPATION_ALIGNMENT",
  /** Liquidity and holder count moved in opposite directions between observations. */
  LIQUIDITY_PARTICIPATION_DIVERGENCE: "LIQUIDITY_PARTICIPATION_DIVERGENCE",
  /** Holder count and top-10 concentration moved in opposite directions between observations. */
  PARTICIPATION_CONCENTRATION_DIVERGENCE: "PARTICIPATION_CONCENTRATION_DIVERGENCE",
  /** Liquidity + holder count increased while concentration decreased — the spec's canonical "broadening" example. */
  BROAD_BASED_LIQUIDITY_GROWTH: "BROAD_BASED_LIQUIDITY_GROWTH",
  /** Liquidity + concentration increased while holder count did not keep pace — the spec's canonical "narrowing" counter-example. */
  CONCENTRATED_LIQUIDITY_GROWTH: "CONCENTRATED_LIQUIDITY_GROWTH",
} as const;
export type TemporalRelationshipType = (typeof TemporalRelationshipType)[keyof typeof TemporalRelationshipType];

export interface TemporalRelationship {
  relationshipType: TemporalRelationshipType;
  /** MEDIUM at most: derived from one previous/current pair, not independent repeated samples — see docs/HISTORICAL_INTELLIGENCE.md. */
  confidence: import("./intelligence.js").Confidence;
  supportingTrends: TrendType[];
  /** Plain factual sentences — never a verdict. */
  evidence: string[];
  /** Non-causal only: "coincided with" / "occurred alongside" / "was accompanied by" / "the observed data shows". Never "caused" / "will cause" / "guarantees" / "proves". */
  interpretation: string;
}

/**
 * The report-level historical intelligence block (Phase 6 §16). `comparisons`
 * doubles as the historical-evidence record (§17) — see MetricDelta's own
 * doc comment — rather than duplicating the same previous/current/timestamp
 * data into a second array.
 */
export interface HistoricalComparison {
  status: HistoryStatus;
  /** Observations used to build this comparison: 1 (current only) or 2 (current + previous). Not a claim about total history depth in the store. */
  observationsUsed: 1 | 2;
  currentObservedAt: string;
  previousObservedAt: string | null;
  comparisons: MetricDelta[];
  trends: Trend[];
  relationships: TemporalRelationship[];
}
