import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";
import { groupSignalsByModule, signalTypeLabel } from "../lib/present-signals";

/**
 * IA layer 5 — "Module Analysis." Grouped strictly by each Signal's real
 * `source` field (see lib/present-signals.ts) — a module only appears here
 * because an actual analyzer emitted at least one signal for it this scan.
 * No module is ever shown empty or invented.
 */

const DIRECTION_TONE: Record<string, BadgeTone> = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
};

export function ModuleAnalysis({ report }: { report: HoodflowReport }) {
  const groups = groupSignalsByModule(report.signals);

  return (
    <section className={styles.card} aria-labelledby="module-analysis-heading">
      <div className={styles.cardHeader}>
        <h2 id="module-analysis-heading" className={styles.cardTitle}>
          Module Analysis
        </h2>
      </div>

      {groups.length === 0 && (
        <p className={styles.muted}>No signals were produced for this scan — see Data Quality above for why.</p>
      )}

      {groups.map((group) => (
        <div key={group.source} className={styles.section}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 8px" }}>
            {group.label}
          </h3>
          <ul className={styles.evidenceList} style={{ listStyle: "none", paddingLeft: 0 }}>
            {group.signals.map((signal, i) => (
              <li
                key={`${signal.signalType}-${i}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "10px 0",
                  borderBottom: i === group.signals.length - 1 ? "none" : "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 550 }}>
                    {signalTypeLabel(signal.signalType)}
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <Badge tone={DIRECTION_TONE[signal.direction] ?? "default"}>{signal.direction}</Badge>
                    <Badge tone="default">{signal.strength}</Badge>
                  </span>
                </div>
                <span className={styles.muted}>
                  {signal.evidence} &middot; confidence {signal.confidence}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
