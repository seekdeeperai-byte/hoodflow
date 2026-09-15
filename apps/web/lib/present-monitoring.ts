import type { HoodflowReport } from "@hoodflow/core";

/**
 * IA layer 9 — "Monitoring Signals." This is presentation only: it does not
 * introduce any new threshold, prediction, or scoring logic. It re-labels
 * data the backend already computed (negative-direction Signals, concerning
 * TemporalRelationship types, and disclosed `limitations`) using the spec's
 * required "Monitor" / "Watch for" / "Potential concern if" vocabulary —
 * never a forecast, never a probability, never "will."
 */
export interface MonitoringItem {
  kind: "signal" | "temporal" | "limitation";
  text: string;
}

/**
 * Temporal relationship types that describe a narrowing/divergent pattern
 * worth flagging for attention — a deliberately small, explicit allowlist
 * (not "anything negative"), matching Phase 6's own "small, non-exhaustive
 * relationship set" constraint. See packages/core/src/types/history.ts for
 * each type's exact, non-causal definition.
 */
const WATCH_TEMPORAL_TYPES = new Set([
  "CONCENTRATED_LIQUIDITY_GROWTH",
  "PARTICIPATION_CONCENTRATION_DIVERGENCE",
  "LIQUIDITY_PARTICIPATION_DIVERGENCE",
]);

export function deriveMonitoringItems(report: HoodflowReport): MonitoringItem[] {
  const items: MonitoringItem[] = [];

  for (const signal of report.signals) {
    if (signal.direction === "NEGATIVE") {
      items.push({ kind: "signal", text: `Potential concern: ${signal.evidence}` });
    }
  }

  for (const rel of report.history.relationships) {
    if (WATCH_TEMPORAL_TYPES.has(rel.relationshipType)) {
      items.push({ kind: "temporal", text: `Watch for: ${rel.interpretation}` });
    }
  }

  for (const limitation of report.limitations) {
    items.push({ kind: "limitation", text: `Monitor: ${limitation}` });
  }

  return items;
}
