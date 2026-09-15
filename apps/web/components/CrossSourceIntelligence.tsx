import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { enumToTitle } from "../lib/format";

const DIVERGENCE_TYPES = new Set(["ONCHAIN_SOCIAL_DIVERGENCE", "ATTENTION_LIQUIDITY_DIVERGENCE", "MULTI_SOURCE_DIVERGENCE"]);

/**
 * Final Intelligence Completion phase §6-9 — Cross-Source Intelligence, the
 * "most important missing feature" per the governing spec. Renders
 * `report.crossSource` (packages/core/src/cross-source/cross-source-engine.ts)
 * and `report.integratedInterpretation` (the final WHAT CHANGED / synthesis
 * / WHAT TO MONITOR layer) together, since they're the same conceptual IA
 * layer. Every interpretation string is rendered verbatim — the backend is
 * contractually non-causal here (see cross-source-engine.ts's own header
 * comment), so this component never rewords or strengthens the language,
 * exactly like HistoricalIntelligence.tsx's own rule for temporal
 * relationships.
 */
export function CrossSourceIntelligence({ report }: { report: HoodflowReport }) {
  const { crossSource, integratedInterpretation } = report;
  const realRelationships = crossSource.relationships.filter((r) => r.relationshipType !== "INSUFFICIENT_CROSS_SOURCE_DATA");

  return (
    <section className={styles.card} aria-labelledby="cross-source-heading">
      <div className={styles.cardHeader}>
        <h2 id="cross-source-heading" className={styles.cardTitle}>
          Cross-Source Intelligence
        </h2>
      </div>

      {realRelationships.length === 0 ? (
        <DataUnavailable reason="No cross-source relationship could be measured this scan — fewer than two independent data domains (on-chain, social, news, attention) had usable data. This is not evidence of alignment or divergence; it is simply unmeasured." />
      ) : (
        <>
          {realRelationships.map((rel, i) => (
            <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i === realRelationships.length - 1 ? "none" : "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <Badge tone={DIVERGENCE_TYPES.has(rel.relationshipType) ? "negative" : "accent"}>{enumToTitle(rel.relationshipType)}</Badge>
                <span className={styles.muted}>{rel.confidence} confidence</span>
                <span className={styles.muted}>&middot; {rel.sourcesInvolved.map((s) => enumToTitle(s)).join(" + ")}</span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text)" }}>{rel.interpretation}</p>
              {rel.evidence.length > 0 && (
                <ul className={styles.evidenceList}>
                  {rel.evidence.map((e, j) => (
                    <li key={j}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {crossSource.temporalAnalysis.map((t, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div className={styles.muted} style={{ marginBottom: 2 }}>
            Temporal sequence
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>{t.description}</p>
        </div>
      ))}

      {integratedInterpretation.crossSourceSummary && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div className={styles.muted} style={{ marginBottom: 4 }}>
            Integrated interpretation
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>{integratedInterpretation.crossSourceSummary}</p>
        </div>
      )}

      {integratedInterpretation.whatToMonitor.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className={styles.muted} style={{ marginBottom: 4 }}>
            What to monitor
          </div>
          <ul className={styles.evidenceList}>
            {integratedInterpretation.whatToMonitor.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p className={styles.muted} style={{ marginTop: 12 }}>
        This is interpretation, not a trade recommendation — HoodFlow never tells you what to buy or sell.
      </p>
    </section>
  );
}
