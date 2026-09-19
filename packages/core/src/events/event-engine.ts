import { DataState, isUsable } from "../types/data-state.js";
import { Confidence, SignalType, Strength, type Signal } from "../types/intelligence.js";
import { DeltaStatus, type HistoricalComparison, type MetricDelta } from "../types/history.js";
import { IdentityStatus } from "../types/identity.js";
import type { SocialSummary, NewsSummary } from "../types/social-news.js";
import { CrossSourceRelationshipType, type CrossSourceIntelligence, type CrossSourceRelationship } from "../types/cross-source.js";
import { type EntityRef, tokenEntity } from "../types/entities.js";
import type { CanonicalRelationship } from "../types/relationship-graph.js";
import { fromCrossSourceRelationship, fromTemporalRelationship } from "../relationships/canonical.js";
import { EventCategory, EventState, EventType, type IntelligenceEvent, type IntelligenceEventFeed } from "../types/events.js";
import type { AdversarialSignal } from "../types/adversarial.js";

/**
 * Intelligence Events (FINAL GAP CLOSURE phase §4) — "what changed?" as a
 * first-class, deterministic capability, derived ENTIRELY from data already
 * computed by other engines (history, identity, social/news analyzers,
 * cross-source engine, ecosystem engine) — see this file's per-section
 * comments for exactly which existing field backs each event type. No event
 * is ever emitted from a DATA_UNAVAILABLE/insufficient underlying state as
 * if it were a positive measurement (§4.5) — every builder below is gated on
 * the same DeltaStatus/DataState/IdentityStatus checks the underlying data
 * already uses, never a separate, weaker check.
 */

function eventId(parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/:/g, "_")).join(":");
}

function magnitudeSignificance(pct: number | null): Strength {
  if (pct === null) return Strength.LOW;
  const abs = Math.abs(pct);
  if (abs >= 50) return Strength.HIGH;
  if (abs >= 15) return Strength.MEDIUM;
  return Strength.LOW;
}

function confidenceToSignificance(confidence: Confidence): Strength {
  if (confidence === Confidence.HIGH) return Strength.HIGH;
  if (confidence === Confidence.MEDIUM) return Strength.MEDIUM;
  return Strength.LOW;
}

interface MetricEventConfig {
  up: EventType;
  down: EventType;
  category: EventCategory;
  source: string;
  label: string;
}

const METRIC_EVENT_MAP: Record<string, MetricEventConfig> = {
  liquidityUsd: { up: EventType.LIQUIDITY_INCREASE, down: EventType.LIQUIDITY_DECREASE, category: EventCategory.MARKET_LIQUIDITY, source: "liquidity", label: "Liquidity" },
  holderCount: { up: EventType.HOLDER_COUNT_INCREASE, down: EventType.HOLDER_COUNT_DECREASE, category: EventCategory.HOLDER, source: "holders", label: "Holder count" },
  top10Pct: { up: EventType.HOLDER_CONCENTRATION_INCREASE, down: EventType.HOLDER_CONCENTRATION_DECREASE, category: EventCategory.HOLDER, source: "holders", label: "Top-10 holder concentration" },
};

function metricDeltaEvents(subject: EntityRef, history: HistoricalComparison): IntelligenceEvent[] {
  const events: IntelligenceEvent[] = [];
  for (const delta of history.comparisons) {
    const cfg = METRIC_EVENT_MAP[delta.metric];
    if (!cfg) continue;
    if (delta.status !== DeltaStatus.INCREASED && delta.status !== DeltaStatus.DECREASED) continue;

    const pct = delta.percentChange ?? delta.percentagePointChange;
    const eventType = delta.status === DeltaStatus.INCREASED ? cfg.up : cfg.down;
    const direction = delta.status === DeltaStatus.INCREASED ? "increased" : "decreased";
    const amountText =
      delta.percentChange !== null
        ? `${delta.percentChange >= 0 ? "+" : ""}${delta.percentChange.toFixed(1)}%`
        : delta.percentagePointChange !== null
          ? `${delta.percentagePointChange >= 0 ? "+" : ""}${delta.percentagePointChange.toFixed(1)}pp`
          : "";

    events.push({
      id: eventId(["metric-delta", subject.id, delta.metric, history.currentObservedAt]),
      eventType,
      category: cfg.category,
      subject,
      relatedEntities: [],
      eventTimestamp: history.currentObservedAt,
      observedTimestamp: history.currentObservedAt,
      significance: magnitudeSignificance(pct),
      dataState: DataState.AVAILABLE,
      confidence: delta.confidence,
      summary: `${cfg.label} ${direction}`,
      description: `${cfg.label} ${direction} from ${delta.previousValue} to ${delta.currentValue}${amountText ? ` (${amountText})` : ""} between ${delta.previousObservedAt} and ${delta.currentObservedAt}.`,
      evidence: [`${cfg.label} moved from ${delta.previousValue} to ${delta.currentValue}${amountText ? ` (${amountText})` : ""}.`],
      source: [cfg.source, "history"],
      previousValue: delta.previousValue,
      currentValue: delta.currentValue,
      delta: delta.absoluteChange,
      affectedDimensions: [delta.metric],
      relatedRelationshipIds: [],
      state: EventState.MEASURED,
    });
  }
  return events;
}

function historyBaselineEvent(subject: EntityRef, history: HistoricalComparison): IntelligenceEvent | undefined {
  if (history.status !== "INSUFFICIENT_HISTORY") return undefined;
  return {
    id: eventId(["history-baseline", subject.id, history.currentObservedAt]),
    eventType: EventType.HISTORY_BASELINE_ESTABLISHED,
    category: EventCategory.HISTORICAL,
    subject,
    relatedEntities: [],
    eventTimestamp: history.currentObservedAt,
    observedTimestamp: history.currentObservedAt,
    significance: Strength.LOW,
    dataState: DataState.PARTIAL,
    confidence: null,
    summary: "Historical baseline established",
    description:
      "This is the first recorded scan of this token — no prior observation exists to compare against yet. This scan establishes the baseline a future scan's comparison will use; it is not evidence of stability, growth, or decline.",
    evidence: ["No previous scan exists for this token in HOODFLOW's history store."],
    source: ["history"],
    previousValue: null,
    currentValue: null,
    delta: null,
    affectedDimensions: [],
    relatedRelationshipIds: [],
    state: EventState.CONTEXTUAL,
  };
}

function multiMetricChangeEvents(subject: EntityRef, history: HistoricalComparison): IntelligenceEvent[] {
  return history.relationships.map((rel) => {
    const canonicalId = fromTemporalRelationship(rel, subject, history.currentObservedAt).id;
    return {
      id: eventId(["multi-metric-change", subject.id, rel.relationshipType, history.currentObservedAt]),
      eventType: EventType.MULTI_METRIC_CHANGE,
      category: EventCategory.HISTORICAL,
      subject,
      relatedEntities: [],
      eventTimestamp: history.currentObservedAt,
      observedTimestamp: history.currentObservedAt,
      significance: confidenceToSignificance(rel.confidence),
      dataState: DataState.AVAILABLE,
      confidence: rel.confidence,
      summary: `Multiple metrics changed together (${rel.relationshipType.replace(/_/g, " ").toLowerCase()})`,
      description: rel.interpretation,
      evidence: rel.evidence,
      source: ["history"],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: [...rel.supportingTrends],
      relatedRelationshipIds: [canonicalId],
      state: EventState.MEASURED,
    };
  });
}

function activityImbalanceEvent(subject: EntityRef, signals: Signal[]): IntelligenceEvent | undefined {
  const signal = signals.find((s) => s.signalType === SignalType.BUY_SELL_IMBALANCE);
  if (!signal) return undefined;
  return {
    id: eventId(["activity-imbalance", subject.id, signal.timestamp]),
    eventType: EventType.ACTIVITY_IMBALANCE_OBSERVED,
    category: EventCategory.ACTIVITY,
    subject,
    relatedEntities: [],
    eventTimestamp: signal.timestamp,
    observedTimestamp: signal.timestamp,
    significance: signal.strength,
    dataState: DataState.AVAILABLE,
    confidence: signal.confidence,
    summary: "Buy/sell activity imbalance observed",
    description: signal.evidence,
    evidence: [signal.evidence],
    source: ["liquidity"],
    previousValue: null,
    currentValue: null,
    delta: null,
    affectedDimensions: ["buySellImbalance"],
    relatedRelationshipIds: [],
    state: EventState.MEASURED,
  };
}

const IDENTITY_EVENT_MAP: Partial<Record<IdentityStatus, { type: EventType; significance: Strength; label: string }>> = {
  CONFIRMED: { type: EventType.IDENTITY_CONFIRMED, significance: Strength.LOW, label: "Identity confirmed" },
  AMBIGUOUS: { type: EventType.IDENTITY_AMBIGUITY_DETECTED, significance: Strength.MEDIUM, label: "Identity ambiguity detected" },
  CONFLICTING: { type: EventType.IDENTITY_CONFLICT_DETECTED, significance: Strength.HIGH, label: "Identity conflict detected" },
};

function identityEvent(
  subject: EntityRef,
  observedAt: string,
  identityStatus: IdentityStatus,
  identityConfidence: Confidence | null,
  previousIdentityStatus: IdentityStatus | undefined,
): IntelligenceEvent | undefined {
  const cfg = IDENTITY_EVENT_MAP[identityStatus];
  if (!cfg) return undefined; // UNVERIFIED/UNAVAILABLE are non-conclusions, never emitted as events (§4.5)
  const isTransition = previousIdentityStatus !== undefined && previousIdentityStatus !== identityStatus;
  const isFirstObservation = previousIdentityStatus === undefined;
  if (!isTransition && !isFirstObservation) return undefined; // no repeat event while status is unchanged
  return {
    id: eventId(["identity", subject.id, identityStatus, observedAt]),
    eventType: cfg.type,
    category: EventCategory.CONTRACT_IDENTITY,
    subject,
    relatedEntities: [],
    eventTimestamp: observedAt,
    observedTimestamp: observedAt,
    significance: cfg.significance,
    dataState: DataState.AVAILABLE,
    confidence: identityConfidence,
    summary: cfg.label,
    description: isFirstObservation
      ? `${cfg.label} on this token's first recorded scan.`
      : `${cfg.label} — identity status changed from ${previousIdentityStatus} to ${identityStatus} since the previous scan.`,
    evidence: [`Identity resolution status: ${identityStatus}.`],
    source: ["identity"],
    previousValue: null,
    currentValue: null,
    delta: null,
    affectedDimensions: ["identity"],
    relatedRelationshipIds: [],
    state: EventState.MEASURED,
  };
}

function socialNewsAccelerationEvents(subject: EntityRef, observedAt: string, signals: Signal[]): IntelligenceEvent[] {
  const events: IntelligenceEvent[] = [];
  const social = signals.find((s) => s.signalType === SignalType.SOCIAL_ATTENTION_ACCELERATION);
  if (social) {
    events.push({
      id: eventId(["social-attention-change", subject.id, social.timestamp]),
      eventType: EventType.SOCIAL_ATTENTION_CHANGE,
      category: EventCategory.EXTERNAL_CONTEXT,
      subject,
      relatedEntities: [],
      eventTimestamp: social.timestamp,
      observedTimestamp: observedAt,
      significance: social.strength,
      dataState: DataState.AVAILABLE,
      confidence: social.confidence,
      summary: "Social attention velocity changed",
      description: social.evidence,
      evidence: [social.evidence],
      source: ["social"],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: ["mentionVelocity"],
      relatedRelationshipIds: [],
      state: EventState.MEASURED,
    });
  }
  const news = signals.find((s) => s.signalType === SignalType.NEWS_COVERAGE_ACCELERATION);
  if (news) {
    events.push({
      id: eventId(["news-activity-change", subject.id, news.timestamp]),
      eventType: EventType.NEWS_ACTIVITY_CHANGE,
      category: EventCategory.EXTERNAL_CONTEXT,
      subject,
      relatedEntities: [],
      eventTimestamp: news.timestamp,
      observedTimestamp: observedAt,
      significance: news.strength,
      dataState: DataState.AVAILABLE,
      confidence: news.confidence,
      summary: "News coverage velocity changed",
      description: news.evidence,
      evidence: [news.evidence],
      source: ["news"],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: ["coverageVelocity"],
      relatedRelationshipIds: [],
      state: EventState.MEASURED,
    });
  }
  return events;
}

const CONVERGENCE_TYPES = new Set<string>([
  CrossSourceRelationshipType.ONCHAIN_SOCIAL_ALIGNMENT,
  CrossSourceRelationshipType.ONCHAIN_NEWS_ALIGNMENT,
  CrossSourceRelationshipType.SOCIAL_NEWS_ALIGNMENT,
  CrossSourceRelationshipType.ATTENTION_ACTIVITY_ALIGNMENT,
  CrossSourceRelationshipType.MULTI_SOURCE_CONVERGENCE,
]);
const DIVERGENCE_TYPES = new Set<string>([
  CrossSourceRelationshipType.ONCHAIN_SOCIAL_DIVERGENCE,
  CrossSourceRelationshipType.ATTENTION_LIQUIDITY_DIVERGENCE,
  CrossSourceRelationshipType.MULTI_SOURCE_DIVERGENCE,
]);

function crossSourceEvents(subject: EntityRef, crossSource: CrossSourceIntelligence): IntelligenceEvent[] {
  const events: IntelligenceEvent[] = [];
  for (const rel of crossSource.relationships) {
    if (rel.relationshipType === CrossSourceRelationshipType.INSUFFICIENT_CROSS_SOURCE_DATA) continue;
    const isConvergence = CONVERGENCE_TYPES.has(rel.relationshipType);
    const isDivergence = DIVERGENCE_TYPES.has(rel.relationshipType);
    if (!isConvergence && !isDivergence) continue;
    const canonicalId = fromCrossSourceRelationship(rel as CrossSourceRelationship, subject).id;
    events.push({
      id: eventId(["cross-source-event", subject.id, rel.relationshipType, rel.observedAt]),
      eventType: isDivergence ? EventType.CROSS_SOURCE_DIVERGENCE_OBSERVED : EventType.CROSS_SOURCE_CONVERGENCE_OBSERVED,
      category: EventCategory.EXTERNAL_CONTEXT,
      subject,
      relatedEntities: [],
      eventTimestamp: rel.observedAt,
      observedTimestamp: rel.observedAt,
      significance: confidenceToSignificance(rel.confidence),
      dataState: rel.dataState,
      confidence: rel.confidence,
      summary: isDivergence ? "Cross-source divergence observed" : "Cross-source convergence observed",
      description: rel.interpretation,
      evidence: rel.evidence,
      source: ["cross-source"],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: rel.sourcesInvolved,
      relatedRelationshipIds: [canonicalId],
      state: EventState.MEASURED,
    });
  }
  return events;
}

function externalContextUnavailableEvent(
  subject: EntityRef,
  observedAt: string,
  social: SocialSummary,
  previousSocial: SocialSummary | undefined,
  news: NewsSummary,
  previousNews: NewsSummary | undefined,
): IntelligenceEvent | undefined {
  const socialBecameUnavailable = previousSocial !== undefined && isUsable(previousSocial.dataState) && !isUsable(social.dataState);
  const newsBecameUnavailable = previousNews !== undefined && isUsable(previousNews.dataState) && !isUsable(news.dataState);
  if (!socialBecameUnavailable && !newsBecameUnavailable) return undefined;

  const channels = [socialBecameUnavailable ? "social" : undefined, newsBecameUnavailable ? "news" : undefined].filter(
    (c): c is string => c !== undefined,
  );
  return {
    id: eventId(["external-context-unavailable", subject.id, observedAt]),
    eventType: EventType.EXTERNAL_CONTEXT_UNAVAILABLE,
    category: EventCategory.EXTERNAL_CONTEXT,
    subject,
    relatedEntities: [],
    eventTimestamp: observedAt,
    observedTimestamp: observedAt,
    significance: Strength.LOW,
    dataState: DataState.DATA_UNAVAILABLE,
    confidence: null,
    summary: "External context coverage was lost",
    description: `${channels.join(" and ")} data was usable in the previous scan but is unavailable this scan — this is a change in data coverage, not evidence that attention or coverage actually dropped to zero.`,
    evidence: [`Previously-usable channel(s) now unavailable: ${channels.join(", ")}.`],
    source: channels,
    previousValue: null,
    currentValue: null,
    delta: null,
    affectedDimensions: channels,
    relatedRelationshipIds: [],
    state: EventState.UNAVAILABLE,
  };
}

function ecosystemRelationshipEvents(
  subject: EntityRef,
  observedAt: string,
  ecosystemRelationships: CanonicalRelationship[],
  previousEcosystemRelationshipIds: Set<string>,
): IntelligenceEvent[] {
  const events: IntelligenceEvent[] = [];
  for (const rel of ecosystemRelationships) {
    // "New" means: not present, by relationship id shape (subject/type/object — timestamp
    // excluded), in the previous scan's ecosystem relationship set. Never fabricated as "new"
    // when there was no previous scan to compare against at all.
    const stableKey = eventId([rel.subject.id, rel.relationshipType, rel.object?.id ?? ""]);
    if (previousEcosystemRelationshipIds.has(stableKey)) continue;
    events.push({
      id: eventId(["ecosystem-relationship-observed", stableKey, observedAt]),
      eventType: EventType.ECOSYSTEM_RELATIONSHIP_OBSERVED,
      category: EventCategory.ECOSYSTEM,
      subject,
      relatedEntities: rel.object ? [rel.object] : [],
      eventTimestamp: rel.observedAt,
      observedTimestamp: observedAt,
      significance: Strength.MEDIUM,
      dataState: rel.dataState,
      confidence: rel.confidence,
      summary: "Ecosystem relationship observed",
      description: rel.interpretation,
      evidence: rel.evidence,
      source: ["ecosystem"],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: [],
      relatedRelationshipIds: [rel.id],
      state: EventState.MEASURED,
    });
  }
  return events;
}

/**
 * One event per OBSERVED Adversarial Intelligence pattern
 * (adversarial/adversarial-engine.ts). Follows the same rules as every other
 * emitter in this file:
 *
 * - **Evidence-triggered.** Only OBSERVED signals qualify. A pattern that was
 *   evaluated and found absent, or that could not be evaluated at all, never
 *   produces an event — otherwise the feed would fill with non-findings and
 *   the absence of data would start to look like a finding.
 * - **Deterministic id**, so re-scanning an unchanged state cannot spam the
 *   feed with duplicates (the shared dedup map below relies on this).
 * - **Derived, never recomputed.** Every field is copied from the signal the
 *   adversarial engine already produced.
 * - **Significance is capped at MEDIUM.** These are patterns worth a look,
 *   never confirmed findings, so none of them earns HIGH significance.
 */
function adversarialEvents(subject: EntityRef, signals: AdversarialSignal[]): IntelligenceEvent[] {
  return signals
    .filter((signal) => signal.status === "OBSERVED")
    .map((signal) => ({
      id: eventId(["adversarial", subject.id, signal.type, signal.observedAt]),
      eventType: EventType.MANIPULATION_SIGNAL_DETECTED,
      category: EventCategory.ADVERSARIAL,
      subject,
      relatedEntities: [],
      eventTimestamp: signal.observedAt,
      observedTimestamp: signal.observedAt,
      significance: signal.severity === "ELEVATED" ? Strength.MEDIUM : Strength.LOW,
      dataState: DataState.AVAILABLE,
      confidence: signal.confidence,
      summary: `Adversarial pattern observed: ${signal.type}`,
      description: signal.explanation,
      evidence: signal.evidence.map(
        (e) => `${e.metric}: ${e.previousValue ?? "unavailable"} -> ${e.currentValue ?? "unavailable"}${e.delta !== null ? ` (delta ${e.delta})` : ""}`,
      ),
      source: ["adversarial", ...signal.source],
      previousValue: null,
      currentValue: null,
      delta: null,
      affectedDimensions: signal.source,
      relatedRelationshipIds: [],
      state: EventState.INFERRED,
    }));
}

/** Stable key matching `ecosystemRelationshipEvents`'s dedup key — used by build-report.ts to build `previousEcosystemRelationshipIds` from a previous scan's ecosystem relationships. */
export function ecosystemRelationshipStableKey(rel: Pick<CanonicalRelationship, "subject" | "relationshipType" | "object">): string {
  return eventId([rel.subject.id, rel.relationshipType, rel.object?.id ?? ""]);
}

export function buildIntelligenceEvents(input: {
  chainId: number;
  address: string;
  generatedAt: string;
  history: HistoricalComparison;
  identityStatus: IdentityStatus;
  identityConfidence: Confidence | null;
  previousIdentityStatus?: IdentityStatus;
  signals: Signal[];
  social: SocialSummary;
  previousSocial?: SocialSummary;
  news: NewsSummary;
  previousNews?: NewsSummary;
  crossSource: CrossSourceIntelligence;
  ecosystemRelationships: CanonicalRelationship[];
  previousEcosystemRelationshipIds: Set<string>;
  /** OBSERVED Adversarial Intelligence patterns. Optional so every existing caller/test keeps working unchanged. */
  adversarialSignals?: AdversarialSignal[];
}): IntelligenceEventFeed {
  const subject = tokenEntity(input.chainId, input.address);
  const limitations: string[] = [];

  const events: IntelligenceEvent[] = [
    ...metricDeltaEvents(subject, input.history),
    ...multiMetricChangeEvents(subject, input.history),
    ...socialNewsAccelerationEvents(subject, input.generatedAt, input.signals),
    ...crossSourceEvents(subject, input.crossSource),
    ...ecosystemRelationshipEvents(subject, input.generatedAt, input.ecosystemRelationships, input.previousEcosystemRelationshipIds),
    ...adversarialEvents(subject, input.adversarialSignals ?? []),
  ];

  const baseline = historyBaselineEvent(subject, input.history);
  if (baseline) events.push(baseline);

  const activity = activityImbalanceEvent(subject, input.signals);
  if (activity) events.push(activity);

  const identity = identityEvent(subject, input.generatedAt, input.identityStatus, input.identityConfidence, input.previousIdentityStatus);
  if (identity) events.push(identity);

  const contextGap = externalContextUnavailableEvent(subject, input.generatedAt, input.social, input.previousSocial, input.news, input.previousNews);
  if (contextGap) events.push(contextGap);

  // Deterministic dedup, defensive: same underlying observation must always produce the same
  // id, and this guarantees no duplicate id ever reaches the API even if a future builder
  // above is accidentally called twice for the same fact.
  const byId = new Map<string, IntelligenceEvent>();
  for (const event of events) byId.set(event.id, event);
  const deduped = [...byId.values()];

  if (deduped.length === 0) {
    limitations.push("No intelligence events were generated this scan — either this is the first scan of a metric-comparable kind, or no tracked change met this taxonomy's thresholds.");
  }

  return {
    dataState: deduped.length > 0 ? DataState.AVAILABLE : DataState.PARTIAL,
    events: deduped,
    limitations,
  };
}
