import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { signalTypeLabel } from "../lib/present-signals";

/**
 * IA layer 8 — "Cross-Signal Interpretation." Renders `report.interpretations`
 * (packages/core/src/interpretation/interpretation-engine.ts) in a
 * SIGNAL / INTERPRETATION / WHAT WOULD CHANGE THIS format — the closest
 * honest mapping to the spec's requested SIGNAL/INTERPRETATION/WHY IT
 * MATTERS layout using only fields the backend actually produces.
 * `Interpretation` has no separate "why it matters" field, so rather than
 * fabricate new prose, the third section uses the backend's own
 * `whatWouldChangeAssessment` — real, backend-authored forward-looking
 * content, not a rewritten invention.
 */
export function Interpretations({ report }: { report: HoodflowReport }) {
  const { interpretations } = report;

  return (
    <section className={styles.card} aria-labelledby="interpretations-heading">
      <div className={styles.cardHeader}>
        <h2 id="interpretations-heading" className={styles.cardTitle}>
          Cross-Signal Interpretation
        </h2>
      </div>

      {interpretations.length === 0 ? (
        <p className={styles.muted}>
          No cross-signal interpretation was generated for this scan — see Module Analysis above for the
          individual signals it would have combined.
        </p>
      ) : (
        interpretations.map((interp, i) => (
          <div
            key={i}
            style={{
              padding: "14px 0",
              borderBottom: i === interpretations.length - 1 ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{interp.headline}</span>
              <Badge tone="default">{interp.confidence}</Badge>
            </div>

            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text)" }}>{interp.summary}</p>

            {interp.supportingMetrics.length > 0 && (
              <>
                <div className={styles.muted} style={{ marginBottom: 2 }}>
                  Supporting evidence
                </div>
                <ul className={styles.evidenceList}>
                  {interp.supportingMetrics.map((m, j) => (
                    <li key={j}>{m}</li>
                  ))}
                </ul>
              </>
            )}

            {interp.contradictingSignals.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className={styles.muted} style={{ marginBottom: 2 }}>
                  Contradicting signals
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {interp.contradictingSignals.map((s) => (
                    <Badge key={s} tone="negative">
                      {signalTypeLabel(s)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {interp.whatWouldChangeAssessment.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className={styles.muted} style={{ marginBottom: 2 }}>
                  What would change this assessment
                </div>
                <ul className={styles.evidenceList}>
                  {interp.whatWouldChangeAssessment.map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {interp.limitations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className={styles.muted} style={{ marginBottom: 2 }}>
                  Limitations
                </div>
                <ul className={styles.evidenceList}>
                  {interp.limitations.map((l, j) => (
                    <li key={j}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
