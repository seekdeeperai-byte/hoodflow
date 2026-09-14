/**
 * Data freshness (product spec §8: "Do not treat old cached data as
 * current data"). Nothing in this build serves cached data yet — every
 * report is built from a fresh, synchronous provider fetch, so
 * OBSERVATION_TIME and FETCH_TIME are the same instant today. This module
 * exists so that changes anyway: once the HistoryStore (docs/ROADMAP.md
 * Phase 4) starts allowing a report to be served from a recent-but-not-
 * brand-new snapshot, `assessFreshness` is the single place that decides
 * whether that snapshot is still CURRENT or has gone STALE — nothing else
 * needs to change.
 */

export const Freshness = {
  CURRENT: "CURRENT",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN",
} as const;
export type Freshness = (typeof Freshness)[keyof typeof Freshness];

/** Default staleness threshold: data older than this is no longer "current" for a live report. */
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface DataFreshnessInfo {
  /** When the underlying fact was actually true / captured. */
  observedAt: string;
  /** When this report was assembled and handed to the caller. */
  servedAt: string;
  ageMs: number;
  status: Freshness;
}

export function assessFreshness(observedAt: string, servedAt: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): DataFreshnessInfo {
  const observedMs = Date.parse(observedAt);
  const servedMs = Date.parse(servedAt);
  if (Number.isNaN(observedMs) || Number.isNaN(servedMs)) {
    return { observedAt, servedAt, ageMs: NaN, status: Freshness.UNKNOWN };
  }
  const ageMs = Math.max(0, servedMs - observedMs);
  return { observedAt, servedAt, ageMs, status: ageMs > maxAgeMs ? Freshness.STALE : Freshness.CURRENT };
}
