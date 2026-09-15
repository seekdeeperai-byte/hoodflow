/**
 * Cross-Source Intelligence types (Final Intelligence Completion phase, §6-8).
 *
 * This is a THIRD relationship engine/type family, deliberately separate
 * from both `RelationshipType` (relationships/relationship-engine.ts, which
 * combines same-snapshot Signals) and `TemporalRelationshipType`
 * (historical/temporal-relationship-engine.ts, which combines cross-scan
 * Trends) — its input (on-chain summaries + social + news + attention, each
 * a structurally different domain) is not a Signal[] or a Trend[], so
 * reusing either existing type/engine would blur three genuinely different
 * combination rules into one. See docs/CROSS_SOURCE_INTELLIGENCE.md.
 *
 * Every interpretation string here must stay within the same non-causal
 * vocabulary already enforced in historical/temporal-relationship-engine.ts
 * and types/history.ts's `TemporalRelationship` doc comment: "coincides
 * with", "occurred alongside", "preceded", "followed", "aligned with",
 * "diverged from", "no relationship measurable" — never "caused",
 * "will cause", "guarantees", or "proves".
 */

import type { DataState } from "./data-state.js";
import type { Confidence } from "./intelligence.js";

export const CrossSourceRelationshipType = {
  ONCHAIN_SOCIAL_ALIGNMENT: "ONCHAIN_SOCIAL_ALIGNMENT",
  ONCHAIN_SOCIAL_DIVERGENCE: "ONCHAIN_SOCIAL_DIVERGENCE",
  ONCHAIN_NEWS_ALIGNMENT: "ONCHAIN_NEWS_ALIGNMENT",
  SOCIAL_NEWS_ALIGNMENT: "SOCIAL_NEWS_ALIGNMENT",
  ATTENTION_LIQUIDITY_DIVERGENCE: "ATTENTION_LIQUIDITY_DIVERGENCE",
  ATTENTION_ACTIVITY_ALIGNMENT: "ATTENTION_ACTIVITY_ALIGNMENT",
  NEWS_ACTIVITY_SEQUENCE: "NEWS_ACTIVITY_SEQUENCE",
  SOCIAL_ACTIVITY_SEQUENCE: "SOCIAL_ACTIVITY_SEQUENCE",
  MULTI_SOURCE_CONVERGENCE: "MULTI_SOURCE_CONVERGENCE",
  MULTI_SOURCE_DIVERGENCE: "MULTI_SOURCE_DIVERGENCE",
  INSUFFICIENT_CROSS_SOURCE_DATA: "INSUFFICIENT_CROSS_SOURCE_DATA",
} as const;
export type CrossSourceRelationshipType = (typeof CrossSourceRelationshipType)[keyof typeof CrossSourceRelationshipType];

/** The domains a given cross-source relationship actually drew evidence from. */
export const CrossSourceDomain = {
  ONCHAIN: "ONCHAIN",
  SOCIAL: "SOCIAL",
  NEWS: "NEWS",
  ATTENTION: "ATTENTION",
} as const;
export type CrossSourceDomain = (typeof CrossSourceDomain)[keyof typeof CrossSourceDomain];

export interface CrossSourceRelationship {
  relationshipType: CrossSourceRelationshipType;
  observedAt: string;
  sourcesInvolved: CrossSourceDomain[];
  evidence: string[];
  /**
   * Never HIGH from a single weak source (§7 of the governing spec) — the
   * engine caps this at MEDIUM unless at least two independently-sourced,
   * AVAILABLE-state domains agree.
   */
  confidence: Confidence;
  interpretation: string;
  dataState: DataState;
}

/** Whether enough real, timestamped observations existed to say which signal appeared first. */
export const TemporalSequenceStatus = {
  MEASURED: "MEASURED",
  INSUFFICIENT_TEMPORAL_DATA: "INSUFFICIENT_TEMPORAL_DATA",
} as const;
export type TemporalSequenceStatus = (typeof TemporalSequenceStatus)[keyof typeof TemporalSequenceStatus];

export interface TemporalCrossSourceObservation {
  status: TemporalSequenceStatus;
  /** Only populated when status is MEASURED. */
  leadingDomain?: CrossSourceDomain;
  laggingDomain?: CrossSourceDomain;
  /** Plain-language lag description, e.g. "approximately 6 hours" — never a fabricated precise duration from coarse timestamps. */
  lagDescription?: string;
  /** Factual, non-causal sentence — see this file's header for the allowed vocabulary. */
  description: string;
}

export interface CrossSourceIntelligence {
  dataState: DataState;
  relationships: CrossSourceRelationship[];
  temporalAnalysis: TemporalCrossSourceObservation[];
  limitations: string[];
}

/**
 * Final synthesis layer (§13). Extends `HoodflowReport` additively — every
 * existing field (`interpretations`, `history`, etc.) is untouched; this is
 * a new top-level field that reads across all of them plus the new
 * social/news/attention/cross-source data, but never overrides or
 * duplicates their authority. Never a trade recommendation (enforced by
 * construction: nothing in build-report.ts's construction of this object
 * ever consults price direction to suggest buying/selling).
 */
export interface IntegratedInterpretation {
  dataState: DataState;
  /** Multi-dimensional "what changed" bullets spanning on-chain + social + news + attention (§15) — a superset of history.comparisons' on-chain-only view. */
  whatChanged: string[];
  /** Plain-language cross-source synthesis paragraph, or null when there isn't enough cross-source data to say anything beyond the individual relationships. */
  crossSourceSummary: string | null;
  whatToMonitor: string[];
  limitations: string[];
}
