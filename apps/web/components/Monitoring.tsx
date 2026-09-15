import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";
import { deriveMonitoringItems } from "../lib/present-monitoring";

const KIND_TONE: Record<string, BadgeTone> = {
  signal: "negative",
  temporal: "neutral",
  crossSource: "accent",
  limitation: "unavailable",
};

const KIND_LABEL: Record<string, string> = {
  signal: "Signal",
  temporal: "Trend",
  crossSource: "Cross-source",
  limitation: "Data gap",
};

export function Monitoring({ report }: { report: HoodflowReport }) {
  const items = deriveMonitoringItems(report);

  return (
    <section className={styles.card} aria-labelledby="monitoring-heading">
      <div className={styles.cardHeader}>
        <h2 id="monitoring-heading" className={styles.cardTitle}>
          Monitoring Signals
        </h2>
      </div>

      {items.length === 0 ? (
        <p className={styles.muted}>Nothing in this scan meets HoodFlow&apos;s criteria for a monitoring item.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 0",
                borderBottom: i === items.length - 1 ? "none" : "1px solid var(--border)",
              }}
            >
              <Badge tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{item.text}</span>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.muted} style={{ marginTop: 12 }}>
        These are observations to watch, not predictions — HoodFlow does not forecast future price or outcomes.
      </p>
    </section>
  );
}
