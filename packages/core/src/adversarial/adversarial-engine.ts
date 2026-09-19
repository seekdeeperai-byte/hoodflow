import { DataState, isUsable } from "../types/data-state.js";
import { Confidence } from "../types/intelligence.js";
import { HistoryStatus, type HistoricalComparison } from "../types/history.js";
import { IdentityStatus, type IdentityResolution } from "../types/identity.js";
import { EntityMatchBasis, type NewsSummary, type SocialSummary } from "../types/social-news.js";
import type { LiquiditySnapshot, HolderSummary } from "../types/domain.js";
import type { EntityRef } from "../types/entities.js";
import { RelationshipCategory, type CanonicalRelationship } from "../types/relationship-graph.js";
import {
  AdversarialSeverity,
  AdversarialSignalStatus,
  AdversarialSignalType,
  type AdversarialEvidence,
  type AdversarialIntelligence,
  type AdversarialSignal,
} from "../types/adversarial.js";

/**
 * Adversarial Intelligence engine (MANIPULATION_RADAR).
 *
 * A pure function over data other engines already produced — it adds no
 * provider, makes no network call, and computes no metric that an existing
 * analyzer already computes. Like every other engine in packages/core it is
 * deterministic: the same inputs always yield the same signals, in the same
 * order, with the same ids.
 *
 * The governing rule, applied to every branch below: a pattern is only
 * emitted when the specific measurements that define it are actually
 * present. When they are not, the signal is still returned — with status
 * DATA_UNAVAILABLE or INSUFFICIENT_TEMPORAL_DATA — so the reader can see
 * *that the check ran and could not conclude*, which is different from the
 * check having passed. Absence is never silently converted into reassurance,
 * and a missing measurement is never read as zero.
 *
 * Thresholds are first-pass and deliberately explicit constants rather than
 * tuned magic numbers, matching the convention in delta-engine.ts and
 * attention-engine.ts. They are documented here so a reader can disagree
 * with a specific number without having to reverse-engineer it.
 */

/**
 * Relative change at which a metric is treated as having moved materially
 * rather than drifted. 25% is the same order of magnitude as the existing
 * delta engine's own noise handling; below this, two observations of a
 * volatile on-chain metric are not distinguishable from noise.
 */
const MATERIAL_CHANGE_PCT = 25;

/**
 * A mismatch requires the two metrics to have diverged by at least this many
 * percentage points of relative change. Set well above MATERIAL_CHANGE_PCT so
 * that "both moved together, roughly proportionally" never trips it.
 */
const MISMATCH_DIVERGENCE_PCT = 40;

/** Top-10 holder share at or above which concentration is described as elevated. Matches holders-analyzer.ts's existing framing of concentration. */
const ELEVATED_TOP10_PCT = 50;

/** Social/news velocity change (posts or stories per hour) treated as a material acceleration. */
const VELOCITY_ACCELERATION = 0.5;

export interface AdversarialInput {
  now: string;
  history: HistoricalComparison;
  identity: IdentityResolution;
  liquidityState: DataState;
  liquidity?: LiquiditySnapshot;
  previousLiquidity?: LiquiditySnapshot;
  previousLiquidityState?: DataState;
  holdersState: DataState;
  holders?: HolderSummary;
  social: SocialSummary;
  news: NewsSummary;
}

function pctChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Total observed trades over the provider's rolling 24h window. Null unless at least one side is reported — never defaulted to 0. */
function tradeCount(liquidity: LiquiditySnapshot | undefined): number | null {
  if (!liquidity) return null;
  const { buys24h, sells24h } = liquidity;
  if (buys24h === undefined && sells24h === undefined) return null;
  return (buys24h ?? 0) + (sells24h ?? 0);
}

/**
 * Counts genuinely independent *data sources* behind a signal.
 *
 * "history" is excluded on purpose. HOODFLOW's history store is not a fourth
 * provider — it is a record of earlier observations from these same
 * providers, i.e. a time dimension over them. Counting it as an independent
 * source would double-count it, because `confidenceFor`/`severityFor`
 * already take `hasComparableHistory` as a separate input. Without this
 * exclusion, a single-provider pattern like "elevated concentration plus an
 * activity change" reached HIGH confidence off two real sources plus its own
 * history, which overstates what two measurements can support.
 */
function independentSourceCount(domains: string[]): number {
  return new Set(domains.filter((d) => d !== "history")).size;
}

/**
 * Confidence from evidence quality only (§16 of the governing spec), never
 * from how striking the pattern looks:
 *
 * - HIGH  — three or more independent data sources AND a comparable history.
 *           Deliberately hard to reach; most scans will never produce it.
 * - MEDIUM— two independent sources, or one source with comparable history.
 * - LOW   — a single observation with nothing corroborating it.
 */
function confidenceFor(domains: string[], hasComparableHistory: boolean): Confidence {
  const independent = independentSourceCount(domains);
  if (independent >= 3 && hasComparableHistory) return Confidence.HIGH;
  if (independent >= 2 || hasComparableHistory) return Confidence.MEDIUM;
  return Confidence.LOW;
}

function severityFor(domains: string[], hasComparableHistory: boolean): AdversarialSeverity {
  const independent = independentSourceCount(domains);
  if (independent >= 3 && hasComparableHistory) return AdversarialSeverity.ELEVATED;
  if (independent >= 2) return AdversarialSeverity.NOTABLE;
  return AdversarialSeverity.INFORMATIONAL;
}

function unevaluated(
  type: AdversarialSignalType,
  status: typeof AdversarialSignalStatus.DATA_UNAVAILABLE | typeof AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
  now: string,
  source: string[],
  explanation: string,
): AdversarialSignal {
  return { type, status, severity: null, confidence: null, observedAt: now, source, evidence: [], explanation };
}

function notObserved(type: AdversarialSignalType, now: string, source: string[], evidence: AdversarialEvidence[], explanation: string): AdversarialSignal {
  return { type, status: AdversarialSignalStatus.NOT_OBSERVED, severity: null, confidence: null, observedAt: now, source, evidence, explanation };
}

/** The one place an OBSERVED signal can be constructed — enforces the "never without evidence" rule structurally. */
function observed(
  type: AdversarialSignalType,
  now: string,
  source: string[],
  evidence: AdversarialEvidence[],
  explanation: string,
  hasComparableHistory: boolean,
): AdversarialSignal {
  if (evidence.length === 0) {
    // Unreachable via the call sites below, and kept as a hard guarantee: an
    // OBSERVED signal with no evidence would violate the layer's core contract,
    // so it degrades to DATA_UNAVAILABLE rather than being emitted as a claim.
    return unevaluated(
      type,
      AdversarialSignalStatus.DATA_UNAVAILABLE,
      now,
      source,
      "This pattern could not be reported because no supporting measurement was available.",
    );
  }
  return {
    type,
    status: AdversarialSignalStatus.OBSERVED,
    severity: severityFor(source, hasComparableHistory),
    confidence: confidenceFor(source, hasComparableHistory),
    observedAt: now,
    source,
    evidence,
    explanation,
  };
}

export function analyzeAdversarial(input: AdversarialInput): AdversarialIntelligence {
  const { now, history, identity, liquidityState, liquidity, previousLiquidity, previousLiquidityState, holdersState, holders, social, news } = input;

  const comparable = history.status === HistoryStatus.COMPARABLE;
  const windowStart = history.previousObservedAt;
  const signals: AdversarialSignal[] = [];
  const limitations: string[] = [];

  const liquidityUsable = isUsable(liquidityState);
  const previousLiquidityUsable = previousLiquidityState !== undefined && isUsable(previousLiquidityState);
  const socialUsable = isUsable(social.dataState);
  const newsUsable = isUsable(news.dataState);

  // ---------------------------------------------------------------------
  // LIQUIDITY_ACTIVITY_MISMATCH
  // ---------------------------------------------------------------------
  const currentTrades = liquidityUsable ? tradeCount(liquidity) : null;
  const previousTrades = previousLiquidityUsable ? tradeCount(previousLiquidity) : null;
  const currentLiquidityUsd = liquidityUsable ? (liquidity?.liquidityUsd ?? null) : null;
  const previousLiquidityUsd = previousLiquidityUsable ? (previousLiquidity?.liquidityUsd ?? null) : null;

  if (!comparable) {
    signals.push(
      unevaluated(
        AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH,
        AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
        now,
        ["liquidity", "history"],
        "No prior comparable observation of this token exists yet, so activity and liquidity cannot be compared over time. This is not evidence that the two are moving together.",
      ),
    );
    limitations.push("Liquidity/activity mismatch could not be evaluated — it requires a prior comparable scan of this token.");
  } else if (currentTrades === null || previousTrades === null || currentLiquidityUsd === null || previousLiquidityUsd === null) {
    signals.push(
      unevaluated(
        AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH,
        AdversarialSignalStatus.DATA_UNAVAILABLE,
        now,
        ["liquidity", "history"],
        "Trade-count and pooled-liquidity figures were not both available across the two observations, so no comparison between them was possible. Unavailable is not zero.",
      ),
    );
    limitations.push("Liquidity/activity mismatch could not be evaluated — trade count and/or pooled liquidity was unavailable in one of the two observations.");
  } else {
    const activityPct = pctChange(previousTrades, currentTrades);
    const liquidityPct = pctChange(previousLiquidityUsd, currentLiquidityUsd);
    const evidence: AdversarialEvidence[] = [
      {
        metric: "tradeCount24h",
        previousValue: previousTrades,
        currentValue: currentTrades,
        delta: currentTrades - previousTrades,
        percentChange: activityPct,
        source: "liquidity",
        observedAt: now,
        windowStart,
        caveat:
          "buys24h/sells24h are the provider's own rolling 24-hour totals. Two scans taken close together cover heavily overlapping windows, so a change here is a change in a rolling aggregate, not a count of trades that happened between the scans.",
      },
      {
        metric: "liquidityUsd",
        previousValue: previousLiquidityUsd,
        currentValue: currentLiquidityUsd,
        delta: currentLiquidityUsd - previousLiquidityUsd,
        percentChange: liquidityPct,
        source: "liquidity",
        observedAt: now,
        windowStart,
      },
    ];

    const activityMoved = activityPct !== null && Math.abs(activityPct) >= MATERIAL_CHANGE_PCT;
    const divergence = activityPct !== null && liquidityPct !== null ? Math.abs(activityPct - liquidityPct) : null;

    if (activityMoved && divergence !== null && divergence >= MISMATCH_DIVERGENCE_PCT) {
      const direction = activityPct > 0 ? "accelerated" : "fell";
      signals.push(
        observed(
          AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH,
          now,
          ["liquidity", "history"],
          evidence,
          `Trading activity ${direction} by ${activityPct.toFixed(1)}% between the two observations while pooled liquidity changed by ${liquidityPct === null ? "an unmeasurable amount" : `${liquidityPct.toFixed(1)}%`} over the same window. ` +
            "This pattern can occur when speculative demand moves faster than available market depth, but it can equally reflect a normal shift in trading interest, a provider-side aggregation artifact, or the rolling-window caveat attached to the trade-count evidence. The available evidence does not distinguish between these explanations.",
          comparable,
        ),
      );
    } else {
      signals.push(
        notObserved(
          AdversarialSignalType.LIQUIDITY_ACTIVITY_MISMATCH,
          now,
          ["liquidity", "history"],
          evidence,
          "Trading activity and pooled liquidity did not diverge materially between the two observations. This covers only this specific pattern and is not a broader statement about the token.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------------
  // SOCIAL_ACCELERATION
  // ---------------------------------------------------------------------
  const socialVelocityChange = socialUsable ? social.mentionVelocityChange : undefined;
  if (!socialUsable) {
    signals.push(
      unevaluated(
        AdversarialSignalType.SOCIAL_ACCELERATION,
        AdversarialSignalStatus.DATA_UNAVAILABLE,
        now,
        ["social"],
        "Social data was unavailable for this scan, so social acceleration could not be evaluated. This means the provider could not be reached or is not configured — not that social activity is low.",
      ),
    );
    limitations.push("Social acceleration could not be evaluated — social data was unavailable this scan.");
  } else if (socialVelocityChange === undefined) {
    signals.push(
      unevaluated(
        AdversarialSignalType.SOCIAL_ACCELERATION,
        AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
        now,
        ["social"],
        "Social data is available but there is no prior scan to establish a baseline, so no acceleration can be measured. A first observation is never acceleration.",
      ),
    );
    limitations.push("Social acceleration could not be evaluated — no prior social baseline exists for this token yet.");
  } else {
    const evidence: AdversarialEvidence[] = [
      {
        metric: "mentionVelocity",
        previousValue: social.mentionVelocity !== undefined ? social.mentionVelocity - socialVelocityChange : null,
        currentValue: social.mentionVelocity ?? null,
        delta: socialVelocityChange,
        percentChange: null,
        source: "social",
        observedAt: now,
        windowStart: social.observationWindowStart ?? windowStart,
      },
    ];
    if (socialVelocityChange >= VELOCITY_ACCELERATION) {
      const onchainConfirms = comparable && history.trends.some((t) => t.direction === "INCREASING");
      signals.push(
        observed(
          AdversarialSignalType.SOCIAL_ACCELERATION,
          now,
          onchainConfirms ? ["social", "history"] : ["social"],
          evidence,
          `Social mention velocity rose by ${socialVelocityChange.toFixed(2)} posts/hour against this token's own recent baseline. ` +
            (onchainConfirms
              ? "An increasing on-chain trend was observed over the same window. "
              : "On-chain confirmation is LIMITED: no corresponding increasing on-chain trend was observed over the same window. ") +
            "This may represent early attention, coordinated promotion, or a narrative event. The available evidence does not distinguish between these explanations.",
          comparable,
        ),
      );
    } else {
      signals.push(
        notObserved(
          AdversarialSignalType.SOCIAL_ACCELERATION,
          now,
          ["social"],
          evidence,
          "Social mention velocity did not rise materially against this token's own recent baseline.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------------
  // NARRATIVE_ACCELERATION (news coverage velocity)
  // ---------------------------------------------------------------------
  const newsVelocityChange = newsUsable ? news.coverageVelocityChange : undefined;
  if (!newsUsable) {
    signals.push(
      unevaluated(
        AdversarialSignalType.NARRATIVE_ACCELERATION,
        AdversarialSignalStatus.DATA_UNAVAILABLE,
        now,
        ["news"],
        "News data was unavailable for this scan, so narrative acceleration could not be evaluated. This means the provider could not be reached — not that no news exists.",
      ),
    );
    limitations.push("Narrative acceleration could not be evaluated — news data was unavailable this scan.");
  } else if (newsVelocityChange === undefined) {
    signals.push(
      unevaluated(
        AdversarialSignalType.NARRATIVE_ACCELERATION,
        AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
        now,
        ["news"],
        "News data is available but there is no prior scan to establish a coverage baseline, so no acceleration can be measured.",
      ),
    );
    limitations.push("Narrative acceleration could not be evaluated — no prior news-coverage baseline exists for this token yet.");
  } else {
    const evidence: AdversarialEvidence[] = [
      {
        metric: "coverageVelocity",
        previousValue: news.coverageVelocity !== undefined ? news.coverageVelocity - newsVelocityChange : null,
        currentValue: news.coverageVelocity ?? null,
        delta: newsVelocityChange,
        percentChange: null,
        source: "news",
        observedAt: now,
        windowStart: news.observationWindowStart ?? windowStart,
        caveat:
          "Two consecutive observations can show acceleration but cannot establish whether it is sustained or repeated — that needs a longer history than this comparison uses.",
      },
    ];
    if (newsVelocityChange >= VELOCITY_ACCELERATION) {
      signals.push(
        observed(
          AdversarialSignalType.NARRATIVE_ACCELERATION,
          now,
          ["news"],
          evidence,
          `Distinct-story coverage velocity rose by ${newsVelocityChange.toFixed(2)} stories/hour against this token's own recent baseline. ` +
            "Whether this is an isolated spike or sustained coverage cannot be determined from two consecutive observations, and the evidence does not distinguish organic newsworthiness from coordinated promotion.",
          comparable,
        ),
      );
    } else {
      signals.push(
        notObserved(
          AdversarialSignalType.NARRATIVE_ACCELERATION,
          now,
          ["news"],
          evidence,
          "Distinct-story coverage velocity did not rise materially against this token's own recent baseline.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------------
  // CONCENTRATION_ACTIVITY_INTERACTION
  // ---------------------------------------------------------------------
  const top10 = isUsable(holdersState) ? (holders?.top10Pct ?? null) : null;
  const activityPctForConcentration = currentTrades !== null && previousTrades !== null ? pctChange(previousTrades, currentTrades) : null;
  if (top10 === null || activityPctForConcentration === null) {
    signals.push(
      unevaluated(
        AdversarialSignalType.CONCENTRATION_ACTIVITY_INTERACTION,
        comparable ? AdversarialSignalStatus.DATA_UNAVAILABLE : AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
        now,
        ["holders", "liquidity"],
        "This interaction needs both a current holder-concentration figure and a measurable activity change; at least one was unavailable. Neither absence is evidence about concentration or activity.",
      ),
    );
    limitations.push("Concentration/activity interaction could not be evaluated — holder concentration and/or a measurable activity change was unavailable.");
  } else if (top10 >= ELEVATED_TOP10_PCT && Math.abs(activityPctForConcentration) >= MATERIAL_CHANGE_PCT) {
    signals.push(
      observed(
        AdversarialSignalType.CONCENTRATION_ACTIVITY_INTERACTION,
        now,
        ["holders", "liquidity", "history"],
        [
          { metric: "top10Pct", previousValue: null, currentValue: top10, delta: null, percentChange: null, source: "holders", observedAt: now, windowStart },
          {
            metric: "tradeCount24h",
            previousValue: previousTrades,
            currentValue: currentTrades,
            delta: currentTrades! - previousTrades!,
            percentChange: activityPctForConcentration,
            source: "liquidity",
            observedAt: now,
            windowStart,
          },
        ],
        `The top 10 holders account for ${top10.toFixed(1)}% of supply while trading activity changed by ${activityPctForConcentration.toFixed(1)}% over the same window. ` +
          "This combination increases how much weight concentration deserves when interpreting the observed activity. It is not a prediction about what those holders will do, and elevated concentration has ordinary explanations including exchange custody, treasury and liquidity-pool addresses.",
        comparable,
      ),
    );
  } else {
    signals.push(
      notObserved(
        AdversarialSignalType.CONCENTRATION_ACTIVITY_INTERACTION,
        now,
        ["holders", "liquidity"],
        [{ metric: "top10Pct", previousValue: null, currentValue: top10, delta: null, percentChange: null, source: "holders", observedAt: now, windowStart }],
        "Holder concentration and activity change did not both cross the thresholds this interaction looks for.",
      ),
    );
  }

  // ---------------------------------------------------------------------
  // TEMPORAL_COORDINATION — adjacency across domains, never causation
  // ---------------------------------------------------------------------
  /**
   * Tracked separately from `movedDomains` on purpose. "Fewer than two domains
   * moved" is only a real conclusion if at least one domain could actually be
   * *read* — otherwise it is an artifact of having no data, and reporting it as
   * NOT_OBSERVED would quietly turn a total absence of evidence into a
   * reassuring "checked, nothing here". Caught by this layer's own adversarial
   * fixture E (all providers in ERROR).
   */
  const evaluableDomains: string[] = [];
  if (comparable && history.trends.length > 0) evaluableDomains.push("history");
  if (socialVelocityChange !== undefined) evaluableDomains.push("social");
  if (newsVelocityChange !== undefined) evaluableDomains.push("news");
  if (activityPctForConcentration !== null) evaluableDomains.push("liquidity");

  const movedDomains: string[] = [];
  if (comparable && history.trends.some((t) => t.direction !== "UNCHANGED")) movedDomains.push("history");
  if (socialVelocityChange !== undefined && Math.abs(socialVelocityChange) >= VELOCITY_ACCELERATION) movedDomains.push("social");
  if (newsVelocityChange !== undefined && Math.abs(newsVelocityChange) >= VELOCITY_ACCELERATION) movedDomains.push("news");
  if (activityPctForConcentration !== null && Math.abs(activityPctForConcentration) >= MATERIAL_CHANGE_PCT) movedDomains.push("liquidity");

  if (!comparable) {
    signals.push(
      unevaluated(
        AdversarialSignalType.TEMPORAL_COORDINATION,
        AdversarialSignalStatus.INSUFFICIENT_TEMPORAL_DATA,
        now,
        ["history"],
        "Temporal adjacency needs a prior comparable observation to define a window. None exists for this token yet.",
      ),
    );
    limitations.push("Temporal coordination could not be evaluated — it requires a prior comparable scan of this token.");
  } else if (evaluableDomains.length === 0) {
    signals.push(
      unevaluated(
        AdversarialSignalType.TEMPORAL_COORDINATION,
        AdversarialSignalStatus.DATA_UNAVAILABLE,
        now,
        ["history"],
        "A comparable window exists, but no domain (on-chain trend, trading activity, social, news) had usable data inside it, so there was nothing whose timing could be compared. This is not a finding that the domains moved independently.",
      ),
    );
    limitations.push("Temporal coordination could not be evaluated — no domain had usable data inside the comparison window.");
  } else if (movedDomains.length >= 2) {
    signals.push(
      observed(
        AdversarialSignalType.TEMPORAL_COORDINATION,
        now,
        movedDomains,
        [
          {
            metric: "domainsChangedInWindow",
            previousValue: null,
            currentValue: movedDomains.length,
            delta: null,
            percentChange: null,
            source: "history",
            observedAt: now,
            windowStart,
            caveat: "Adjacency within one observation window only. The window's resolution is the gap between the two scans, which is not fine enough to establish ordering between domains.",
          },
        ],
        `Changes in ${movedDomains.length} independent domains (${movedDomains.join(", ")}) fall inside the same observation window${windowStart ? ` (${windowStart} to ${now})` : ""}. ` +
          "These observations occurred within the same observed time window. That adjacency is the entire finding: it does not establish ordering, and it does not establish that any one of them influenced another.",
        comparable,
      ),
    );
  } else {
    signals.push(
      notObserved(
        AdversarialSignalType.TEMPORAL_COORDINATION,
        now,
        ["history"],
        [
          {
            metric: "domainsChangedInWindow",
            previousValue: null,
            currentValue: movedDomains.length,
            delta: null,
            percentChange: null,
            source: "history",
            observedAt: now,
            windowStart,
          },
        ],
        "Fewer than two independent domains changed materially inside this observation window.",
      ),
    );
  }

  // ---------------------------------------------------------------------
  // IDENTITY_NARRATIVE_CONFLICT
  // ---------------------------------------------------------------------
  const identityUncertain = identity.status === IdentityStatus.AMBIGUOUS || identity.status === IdentityStatus.CONFLICTING;
  const weakExternalMatches = [
    ...(socialUsable ? social.observations : []).map((o) => o.entityMatch.basis),
    ...(newsUsable ? news.storyGroups.flatMap((g) => g.members.map((a) => a.entityMatch.basis)) : []),
  ].filter((basis) => basis === EntityMatchBasis.SYMBOL_AMBIGUOUS || basis === EntityMatchBasis.NO_MATCH);

  if (!socialUsable && !newsUsable) {
    signals.push(
      unevaluated(
        AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT,
        AdversarialSignalStatus.DATA_UNAVAILABLE,
        now,
        ["identity"],
        "No external coverage was available this scan, so on-chain identity could not be compared against how external sources refer to this token.",
      ),
    );
    limitations.push("Identity/narrative conflict could not be evaluated — no social or news data was available this scan.");
  } else if (identityUncertain && weakExternalMatches.length > 0) {
    signals.push(
      observed(
        AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT,
        now,
        ["identity", socialUsable ? "social" : "news"],
        [
          { metric: "weakExternalMatches", previousValue: null, currentValue: weakExternalMatches.length, delta: null, percentChange: null, source: "identity", observedAt: now, windowStart: null },
        ],
        `This token's on-chain identity is ${identity.status} in HOODFLOW's registry, and ${weakExternalMatches.length} external item(s) attach to it only on weak grounds (an ambiguous symbol, or no verifiable match at all). ` +
          "This matters because a reader can be looking at one contract while the external coverage in front of them refers to a different asset that shares a ticker. It is a warning about attribution, not about the contract's behavior.",
        comparable,
      ),
    );
  } else {
    signals.push(
      notObserved(
        AdversarialSignalType.IDENTITY_NARRATIVE_CONFLICT,
        now,
        ["identity"],
        [
          { metric: "weakExternalMatches", previousValue: null, currentValue: weakExternalMatches.length, delta: null, percentChange: null, source: "identity", observedAt: now, windowStart: null },
        ],
        identityUncertain
          ? "On-chain identity is not fully resolved, but no external item attaches to this token on weak grounds."
          : "On-chain identity resolution did not report ambiguity or conflict for this token.",
      ),
    );
  }

  const evaluated = signals.filter(
    (s) => s.status === AdversarialSignalStatus.OBSERVED || s.status === AdversarialSignalStatus.NOT_OBSERVED,
  );

  return {
    dataState: evaluated.length > 0 ? DataState.AVAILABLE : DataState.DATA_UNAVAILABLE,
    signals,
    limitations,
  };
}

/**
 * Adapts OBSERVED adversarial signals into the existing
 * `CanonicalRelationship` shape (types/relationship-graph.ts), exactly as
 * ecosystem-engine.ts and event-engine.ts already do for their own output.
 * This is what keeps Adversarial Intelligence inside the one canonical graph
 * instead of creating a parallel one.
 *
 * Only OBSERVED signals become relationships: a pattern that could not be
 * evaluated, or was evaluated and found absent, is not a relationship between
 * observations and must not inflate `categoryCounts`.
 */
export function toCanonicalAdversarialRelationships(
  intelligence: AdversarialIntelligence,
  subject: EntityRef,
): CanonicalRelationship[] {
  return intelligence.signals
    .filter((signal) => signal.status === AdversarialSignalStatus.OBSERVED)
    .map((signal) => ({
      id: `adversarial:${subject.id}:${signal.type}:${signal.observedAt.replace(/[:.]/g, "_")}`,
      category: RelationshipCategory.ADVERSARIAL,
      relationshipType: signal.type,
      observedAt: signal.observedAt,
      subject,
      sourcesInvolved: signal.source,
      evidence: signal.evidence.map((e) =>
        `${e.metric}: ${e.previousValue ?? "unavailable"} -> ${e.currentValue ?? "unavailable"}` +
        (e.delta !== null ? ` (delta ${e.delta})` : "") +
        (e.caveat ? ` — ${e.caveat}` : ""),
      ),
      confidence: signal.confidence ?? Confidence.LOW,
      dataState: DataState.AVAILABLE,
      interpretation: signal.explanation,
    }));
}
