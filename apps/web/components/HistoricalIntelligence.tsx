import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { presentTrend } from "../lib/present-history";
import { metricLabel, enumToTitle } from "../lib/format";

/**
 * IA layer 7 — "Historical Intelligence": the synthesized trend and
 * cross-metric temporal-relationship view built on top of layer 6's raw
 * deltas. Trends and temporal relationships both come from
 * `report.history` (packages/core/src/historical/trend-engine.ts and
 * temporal-relationship-engine.ts) and are combined into one card because
 * they're two views of the same Phase 6 "historical intelligence" concept —
 * the spec's own IA list names this single layer "Historical Intelligence."
 * `interpretation` strings are rendered verbatim: the backend is
 * contractually non-causal there (see docs/HISTORICAL_INTELLIGENCE.md), so
 * this component never rewords or strengthens the language.
 */
export function HistoricalIntelligence({ report }: { report: HoodflowReport }) {
  const { history } = report;

  if (history.status === "INSUFFICIENT_HISTORY") {
    return (
      <section className={styles.card} aria-labelledby="historical-intelligence-heading">
        <div className={styles.cardHeader}>
          <h2 id="historical-intelligence-heading" className={styles.cardTitle}>
            Historical Intelligence
          </h2>
        </div>
        <DataUnavailable reason="Trend and relationship intelligence require at least two scans of this token. Only one scan exists so far." />
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="historical-intelligence-heading">
      <div className={styles.cardHeader}>
        <h2 id="historical-intelligence-heading" className={styles.cardTitle}>
          Historical Intelligence
        </h2>
      </div>

      <div className={styles.section}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 8px" }}>Trends</h3>
        {history.trends.length === 0 ? (
          <p className={styles.muted}>No trend data was produced for this comparison.</p>
        ) : (
          history.trends.map((trend) => (
            <div className={styles.row} key={trend.metric}>
              <span className={styles.label}>{metricLabel(trend.metric)}</span>
              <span className={styles.value}>
                {presentTrend(trend)} <span className={styles.muted}>({trend.confidence})</span>
              </span>
            </div>
          ))
        )}
      </div>

      <div className={styles.section} style={{ marginBottom: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 8px" }}>
          Temporal Relationships
        </h3>
        {history.relationships.length === 0 ? (
          <p className={styles.muted}>No cross-metric temporal relationship was identified in this comparison.</p>
        ) : (
          history.relationships.map((rel, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Badge tone="accent">{enumToTitle(rel.relationshipType)}</Badge>
                <span className={styles.muted}>{rel.confidence} confidence</span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text)" }}>{rel.interpretation}</p>
              <ul className={styles.evidenceList}>
                {rel.evidence.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
