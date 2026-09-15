import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { DataUnavailable } from "./DataUnavailable";
import { presentDelta } from "../lib/present-history";
import { formatTimestamp } from "../lib/format";

/**
 * IA layer 6 — "What Changed." The single most product-critical component
 * per the spec: a highly visible, first-class rendering of the backend's
 * real per-scan `history.comparisons` (MetricDelta[]) — see
 * packages/core/src/historical/delta-engine.ts. Every value here already
 * existed in the report; this component only formats and arranges it
 * (lib/present-history.ts's presentDelta), never computes it.
 */

const DIRECTION_ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "→", unavailable: "?" };
const DIRECTION_CLASS: Record<string, string> = {
  up: "deltaUp",
  down: "deltaDown",
  flat: "deltaFlat",
  unavailable: "deltaUnavailable",
};

/**
 * Final Intelligence Completion phase (§15): "What Changed" becomes
 * multi-dimensional — on-chain (unchanged, above) plus social/news/
 * attention, sourced from `report.integratedInterpretation.whatChanged`
 * (packages/core/src/interpretation/integrated-interpretation.ts), which
 * already excludes any domain that had no real observation this scan. The
 * "On-chain:" prefixed entries are filtered out here because the on-chain
 * deltas above already render that exact information with real up/down
 * arrows — this section adds only what the on-chain view can't show.
 */
function BeyondOnChain({ report }: { report: HoodflowReport }) {
  const extra = report.integratedInterpretation.whatChanged.filter((w) => !w.startsWith("On-chain:"));
  if (extra.length === 0) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <div className={styles.muted} style={{ marginBottom: 6 }}>
        Beyond on-chain
      </div>
      <ul className={styles.evidenceList}>
        {extra.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function WhatChanged({ report }: { report: HoodflowReport }) {
  const { history } = report;

  if (history.status === "INSUFFICIENT_HISTORY") {
    return (
      <section className={styles.card} aria-labelledby="what-changed-heading">
        <div className={styles.cardHeader}>
          <h2 id="what-changed-heading" className={styles.cardTitle}>
            What Changed
          </h2>
        </div>
        <DataUnavailable reason="This is the first recorded scan of this exact token — there is no prior observation to compare against yet. This is unmeasured, not unchanged, and not a negative finding." />
        <BeyondOnChain report={report} />
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="what-changed-heading">
      <div className={styles.cardHeader}>
        <h2 id="what-changed-heading" className={styles.cardTitle}>
          What Changed
        </h2>
      </div>

      <p className={styles.muted} style={{ marginBottom: 12 }}>
        Comparing this scan ({formatTimestamp(history.currentObservedAt)}) against the previous scan
        {history.previousObservedAt ? ` (${formatTimestamp(history.previousObservedAt)})` : ""}.
      </p>

      {history.comparisons.map((delta) => {
        const p = presentDelta(delta);
        const directionClassKey = DIRECTION_CLASS[p.direction] ?? "deltaUnavailable";
        return (
          <div className={styles.row} key={delta.metric}>
            <span className={styles.label}>{p.label}</span>
            {p.changeText !== null ? (
              <span
                className={`${styles.value} ${styles[directionClassKey] ?? ""}`}
                style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
              >
                <span aria-hidden="true">{DIRECTION_ARROW[p.direction]}</span>
                {p.changeText}
              </span>
            ) : (
              // A full backend-authored sentence, not a short tabular value — rendered as
              // normal inline prose (the icon is just its leading character) so it wraps
              // like a sentence instead of centering oddly against a multi-line block, and
              // reads as text rather than as a broken numeric/code value. See ui.module.css's
              // .valueReason comment — found in real-browser QA, not a stylistic change.
              <span className={styles.valueReason}>
                <span aria-hidden="true">{DIRECTION_ARROW[p.direction]} </span>
                {p.unavailableReason}
              </span>
            )}
          </div>
        );
      })}

      <BeyondOnChain report={report} />
    </section>
  );
}
