/**
 * Adversarial Intelligence (internal codename MANIPULATION_RADAR).
 *
 * Answers exactly one question: **"do multiple independent observations form
 * an unusual pattern that deserves attention?"** — never "is this token
 * manipulated?". Every type in this file exists to keep that distinction
 * structurally enforced rather than left to prose discipline:
 *
 * - There is no numeric "manipulation score". Scores invite ranking,
 *   thresholding and eventually a buy/sell reading; explainable categorical
 *   signals with attached evidence cannot be collapsed that way.
 * - There is no `MANIPULATED` / `SCAM` / `FRAUD` status. A signal's status is
 *   about whether HOODFLOW could *observe a pattern*, never about intent.
 * - `severity` tops out at ELEVATED and is explicitly about how much
 *   attention the pattern warrants, not how bad the token is.
 * - Every signal must carry structured `evidence`; a signal with no evidence
 *   is unrepresentable, because `AdversarialSignal.evidence` is required and
 *   the engine refuses to emit OBSERVED without at least one item.
 *
 * See docs/ADVERSARIAL_INTELLIGENCE.md for the full design rationale and the
 * list of patterns deliberately NOT implemented.
 */

import type { Confidence } from "./intelligence.js";
import type { DataState } from "./data-state.js";

/**
 * Bounded taxonomy. Each member is a *pattern shape*, not a verdict, and each
 * is only emitted when the specific measurements it names are actually
 * available — see adversarial/adversarial-engine.ts.
 */
export const AdversarialSignalType = {
  /** Trading activity and available market depth moved by materially different amounts between two observations. */
  LIQUIDITY_ACTIVITY_MISMATCH: "LIQUIDITY_ACTIVITY_MISMATCH",
  /** Social mention velocity rose materially against this token's own recent baseline. */
  SOCIAL_ACCELERATION: "SOCIAL_ACCELERATION",
  /** Changes in two or more independent domains fall inside the same observation window. Adjacency only — never causation. */
  TEMPORAL_COORDINATION: "TEMPORAL_COORDINATION",
  /** Holder concentration is elevated at the same time as a material activity change. An interaction between two measurements, not a risk verdict about either. */
  CONCENTRATION_ACTIVITY_INTERACTION: "CONCENTRATION_ACTIVITY_INTERACTION",
  /** News coverage velocity rose materially against this token's own recent baseline. */
  NARRATIVE_ACCELERATION: "NARRATIVE_ACCELERATION",
  /** The token's on-chain identity is ambiguous/conflicting while external coverage attaches to it on weak grounds (symbol only, or no match). */
  IDENTITY_NARRATIVE_CONFLICT: "IDENTITY_NARRATIVE_CONFLICT",
} as const;
export type AdversarialSignalType = (typeof AdversarialSignalType)[keyof typeof AdversarialSignalType];

/**
 * Whether the pattern could be evaluated at all, and if so whether it was
 * present. `NOT_OBSERVED` is a real, useful conclusion ("we looked and the
 * pattern is not there"); it is deliberately distinct from the two
 * can't-tell states, which must never be read as reassurance.
 */
export const AdversarialSignalStatus = {
  /** The pattern's inputs were available and the pattern is present. */
  OBSERVED: "OBSERVED",
  /** The inputs were available and the pattern is not present. Not a clean bill of health — only this one pattern was checked. */
  NOT_OBSERVED: "NOT_OBSERVED",
  /** The inputs exist but there is no comparable prior observation to measure change against. Never negative evidence. */
  INSUFFICIENT_TEMPORAL_DATA: "INSUFFICIENT_TEMPORAL_DATA",
  /** One or more required measurements were unavailable this scan. Never treated as zero, false, or safe. */
  DATA_UNAVAILABLE: "DATA_UNAVAILABLE",
} as const;
export type AdversarialSignalStatus = (typeof AdversarialSignalStatus)[keyof typeof AdversarialSignalStatus];

/**
 * How much attention the pattern warrants — NOT how dangerous the token is,
 * and deliberately without a "critical"/"danger" tier. The scale stops at
 * ELEVATED because nothing this layer can observe justifies alarm language:
 * every pattern here has mundane explanations that the available evidence
 * cannot rule out.
 */
export const AdversarialSeverity = {
  /** Worth recording; on its own says very little. */
  INFORMATIONAL: "INFORMATIONAL",
  /** A real pattern across available measurements. */
  NOTABLE: "NOTABLE",
  /** A pattern spanning multiple independent domains with historical support. */
  ELEVATED: "ELEVATED",
} as const;
export type AdversarialSeverity = (typeof AdversarialSeverity)[keyof typeof AdversarialSeverity];

/**
 * One measured fact behind a signal. Mirrors `MetricDelta`'s honesty
 * contract (types/history.ts): previous and current values are preserved
 * verbatim, `null` means "not available" and never zero, and the observation
 * window is always stated so a reader can judge the measurement themselves.
 */
export interface AdversarialEvidence {
  /** Domain field name, e.g. "tradeCount24h", "liquidityUsd", "mentionVelocity", "top10Pct". */
  metric: string;
  previousValue: number | null;
  currentValue: number | null;
  /** currentValue - previousValue when both are known; null otherwise. Never inferred. */
  delta: number | null;
  /** Percent change when both values are known and the previous value is non-zero. Null otherwise — never a divide-by-zero artifact. */
  percentChange: number | null;
  /** Which already-computed domain this came from: "liquidity" | "holders" | "social" | "news" | "history" | "identity". */
  source: string;
  observedAt: string;
  /** Start of the window this measurement covers, when the underlying data defines one. */
  windowStart: string | null;
  /** Any caveat that materially affects how the number should be read (e.g. overlapping rolling windows). Never omitted to make a signal look stronger. */
  caveat?: string;
}

export interface AdversarialSignal {
  type: AdversarialSignalType;
  status: AdversarialSignalStatus;
  /** Null unless `status` is OBSERVED — an unobserved pattern has no severity to report. */
  severity: AdversarialSeverity | null;
  /** Null unless `status` is OBSERVED. Derived from evidence quality only (see the engine's `confidenceFor`), never from how alarming the pattern sounds. */
  confidence: Confidence | null;
  observedAt: string;
  /** Domains this signal draws on, e.g. ["liquidity", "history"]. */
  source: string[];
  /** Required. The engine never emits an OBSERVED signal with an empty array. */
  evidence: AdversarialEvidence[];
  /**
   * Non-causal, non-accusatory prose. Must state what was observed, and — for
   * an OBSERVED signal — must also state what the evidence cannot distinguish.
   * Vocabulary rule is the same one already enforced in
   * cross-source-engine.ts and temporal-relationship-engine.ts: "coincided
   * with", "occurred alongside", "within the same window"; never "caused",
   * "proves", "is manipulation".
   */
  explanation: string;
}

/**
 * The report-level block. `dataState` describes the layer as a whole:
 * AVAILABLE when at least one pattern could actually be evaluated,
 * DATA_UNAVAILABLE when none could.
 */
export interface AdversarialIntelligence {
  dataState: DataState;
  signals: AdversarialSignal[];
  /** Patterns that could not be evaluated, and why — the same limitations convention used everywhere else in this report. */
  limitations: string[];
}
