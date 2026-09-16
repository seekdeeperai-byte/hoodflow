/**
 * Intelligence Events (FINAL GAP CLOSURE phase §4). Answers "what changed?"
 * as a first-class, typed, deterministic capability — derived entirely from
 * data other analyzers/engines already computed (§4.2: no duplicate
 * analyzer for a metric already calculated elsewhere). See
 * docs/INTELLIGENCE_EVENTS.md for the full taxonomy, significance rules, and
 * the semantics guardrails (§4.5) this type's own fields exist to enforce.
 */

import type { Confidence, Strength } from "./intelligence.js";
import type { DataState } from "./data-state.js";
import type { EntityRef } from "./entities.js";

export const EventCategory = {
  MARKET_LIQUIDITY: "MARKET_LIQUIDITY",
  HOLDER: "HOLDER",
  ACTIVITY: "ACTIVITY",
  CONTRACT_IDENTITY: "CONTRACT_IDENTITY",
  HISTORICAL: "HISTORICAL",
  EXTERNAL_CONTEXT: "EXTERNAL_CONTEXT",
  ECOSYSTEM: "ECOSYSTEM",
} as const;
export type EventCategory = (typeof EventCategory)[keyof typeof EventCategory];

/**
 * A bounded, deterministic taxonomy — NOT the full exhaustive list a future
 * phase could imagine, only the event types this phase can back with real,
 * already-computed data without fabricating a measurement. See
 * docs/INTELLIGENCE_EVENTS.md "Taxonomy and what's deliberately not
 * included" for exactly what was left out and why.
 */
export const EventType = {
  LIQUIDITY_INCREASE: "LIQUIDITY_INCREASE",
  LIQUIDITY_DECREASE: "LIQUIDITY_DECREASE",
  HOLDER_COUNT_INCREASE: "HOLDER_COUNT_INCREASE",
  HOLDER_COUNT_DECREASE: "HOLDER_COUNT_DECREASE",
  HOLDER_CONCENTRATION_INCREASE: "HOLDER_CONCENTRATION_INCREASE",
  HOLDER_CONCENTRATION_DECREASE: "HOLDER_CONCENTRATION_DECREASE",
  ACTIVITY_IMBALANCE_OBSERVED: "ACTIVITY_IMBALANCE_OBSERVED",
  IDENTITY_CONFIRMED: "IDENTITY_CONFIRMED",
  IDENTITY_AMBIGUITY_DETECTED: "IDENTITY_AMBIGUITY_DETECTED",
  IDENTITY_CONFLICT_DETECTED: "IDENTITY_CONFLICT_DETECTED",
  HISTORY_BASELINE_ESTABLISHED: "HISTORY_BASELINE_ESTABLISHED",
  MULTI_METRIC_CHANGE: "MULTI_METRIC_CHANGE",
  SOCIAL_ATTENTION_CHANGE: "SOCIAL_ATTENTION_CHANGE",
  NEWS_ACTIVITY_CHANGE: "NEWS_ACTIVITY_CHANGE",
  CROSS_SOURCE_CONVERGENCE_OBSERVED: "CROSS_SOURCE_CONVERGENCE_OBSERVED",
  CROSS_SOURCE_DIVERGENCE_OBSERVED: "CROSS_SOURCE_DIVERGENCE_OBSERVED",
  EXTERNAL_CONTEXT_UNAVAILABLE: "EXTERNAL_CONTEXT_UNAVAILABLE",
  ECOSYSTEM_RELATIONSHIP_OBSERVED: "ECOSYSTEM_RELATIONSHIP_OBSERVED",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Whether this event's content was directly measured, derived by combining measured facts, contextual framing, or itself represents an absence/insufficiency. Never MEASURED for something that wasn't. */
export const EventState = {
  MEASURED: "MEASURED",
  INFERRED: "INFERRED",
  CONTEXTUAL: "CONTEXTUAL",
  UNAVAILABLE: "UNAVAILABLE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
} as const;
export type EventState = (typeof EventState)[keyof typeof EventState];

export interface IntelligenceEvent {
  /** Deterministic — same underlying observation always produces the same id; see events/event-engine.ts's `eventId()`. */
  id: string;
  eventType: EventType;
  category: EventCategory;
  subject: EntityRef;
  relatedEntities: EntityRef[];
  /** When the underlying change actually occurred/was observed (e.g. the current scan's `capturedAt`, or a comparison window's end). */
  eventTimestamp: string;
  /** When this report noticed it — normally identical to `eventTimestamp` in this single-process pipeline, kept distinct because they are conceptually different facts. */
  observedTimestamp: string;
  significance: Strength;
  dataState: DataState;
  /** Null only when `state` is UNAVAILABLE/INSUFFICIENT_DATA — never fabricated for an event with no real underlying confidence figure. */
  confidence: Confidence | null;
  /** Short, neutral label — e.g. "Liquidity increased," never "Bullish liquidity surge." */
  summary: string;
  /** One or more factual sentences — no verdicts, same convention as every other evidence/description string in this codebase. */
  description: string;
  evidence: string[];
  /** Provenance — which already-computed domain(s) this event was derived from, e.g. ["history"], ["social"], ["identity"]. */
  source: string[];
  previousValue: number | null;
  currentValue: number | null;
  delta: number | null;
  affectedDimensions: string[];
  /** `CanonicalRelationship.id` values (types/relationship-graph.ts) this event is grounded in, when applicable. */
  relatedRelationshipIds: string[];
  state: EventState;
}

export interface IntelligenceEventFeed {
  dataState: DataState;
  events: IntelligenceEvent[];
  limitations: string[];
}
