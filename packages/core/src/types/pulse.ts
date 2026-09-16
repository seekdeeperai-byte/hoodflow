/**
 * Robinhood Ecosystem Pulse (FINAL GAP CLOSURE phase §6). Chain-level,
 * additive to token-level intelligence — never a replacement. Aggregates
 * ONLY over scans this build has actually recorded in its `HistoryStore`
 * (see history/history-store.ts's new `getAllScansSince`), and each
 * per-token figure reuses that token's own already-computed
 * `HoodflowReport.events`/`dataQuality`/`identity`/`hype` rather than
 * recomputing anything (§6.5's "no unsupported extrapolation," §4.2's
 * "reuse existing canonical outputs" applied at the ecosystem level). See
 * docs/ROBINHOOD_ECOSYSTEM_PULSE.md.
 */

import type { Confidence } from "./intelligence.js";
import type { DataState } from "./data-state.js";

export const PulseWindow = {
  ONE_HOUR: "1h",
  SIX_HOURS: "6h",
  TWENTY_FOUR_HOURS: "24h",
  SEVEN_DAYS: "7d",
  THIRTY_DAYS: "30d",
} as const;
export type PulseWindow = (typeof PulseWindow)[keyof typeof PulseWindow];

export const PulseDimensionState = {
  MEASURED: "MEASURED",
  /** Real tokens were tracked in this window, but none contributed a usable observation for this specific dimension. A real, informative zero (never fabricated). */
  MEASURED_ZERO: "MEASURED_ZERO",
  INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY",
  DATA_UNAVAILABLE: "DATA_UNAVAILABLE",
} as const;
export type PulseDimensionState = (typeof PulseDimensionState)[keyof typeof PulseDimensionState];

export interface PulseDimension {
  /** Stable machine-readable key, e.g. "liquidityChanges" — see docs/ROBINHOOD_ECOSYSTEM_PULSE.md for the full, bounded dimension list. */
  name: string;
  label: string;
  state: PulseDimensionState;
  /** How many of this window's scans actually contributed a usable observation to this specific dimension — never the same as `trackedTokenCount` unless every tracked token contributed. */
  observationCount: number;
  /** observationCount / trackedTokenCount, 0-1. Undefined when trackedTokenCount is 0 (nothing to divide by). */
  sourceCoverage?: number;
  confidence: Confidence | null;
  dataState: DataState;
  summary: string;
  /** Structured numeric result, when this dimension has one (e.g. net liquidity-increase count). Undefined, never 0, when not applicable/measured. */
  value?: number;
  /** Factual, bounded (see docs/ROBINHOOD_ECOSYSTEM_PULSE.md's cap) per-token or aggregate detail lines. */
  details: string[];
  limitations: string[];
}

export interface PulseEventSummary {
  eventType: string;
  count: number;
  /** Bounded list of contributing token addresses — never every match, see docs/ROBINHOOD_ECOSYSTEM_PULSE.md. */
  exampleTokenAddresses: string[];
}

export interface EcosystemPulse {
  chainId: number;
  chainName: string;
  generatedAt: string;
  window: PulseWindow;
  windowStartedAt: string;
  windowEndedAt: string;
  coverage: {
    /** Size of HOODFLOW's own known-token registry for this chain — a coverage denominator, never a claim of "every token on this chain." */
    registrySize: number;
    /** Distinct tokens with at least one recorded scan inside the window. */
    trackedTokenCount: number;
    /** Total scans (not distinct tokens) recorded inside the window. */
    scanCount: number;
  };
  dimensions: PulseDimension[];
  eventSummaries: PulseEventSummary[];
  dataState: DataState;
  limitations: string[];
}
