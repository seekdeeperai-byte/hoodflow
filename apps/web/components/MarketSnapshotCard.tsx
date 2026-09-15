import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";

/**
 * IA layer 4 — "Current Market / On-Chain Signals" snapshot: the fields
 * that aren't already covered by the per-module breakdown (layer 5) — an
 * at-a-glance summary of attention/hype level and social/news coverage,
 * ahead of the full detail in the dedicated Social Signals / News & Context
 * / Attention sections further down the page (see ReportView.tsx). As of
 * the Final Intelligence Completion phase this reflects the real
 * `report.hype`/`social`/`news` DataState — UNKNOWN/unavailable here means
 * this specific scan had no usable data (no credential configured, or the
 * provider was unreachable), never "not implemented."
 */

const HYPE_TONE: Record<string, BadgeTone> = {
  QUIET: "neutral",
  EMERGING: "neutral",
  ACCELERATING: "positive",
  HIGH_ATTENTION: "positive",
  EXTREME_ATTENTION: "neutral",
  COOLING: "neutral",
  UNKNOWN: "unavailable",
};

export function MarketSnapshotCard({ report }: { report: HoodflowReport }) {
  const { hype, social, news } = report;

  return (
    <section className={styles.card} aria-labelledby="market-snapshot-heading">
      <div className={styles.cardHeader}>
        <h2 id="market-snapshot-heading" className={styles.cardTitle}>
          Attention &amp; Coverage
        </h2>
        <Badge tone={HYPE_TONE[hype.state] ?? "default"}>{hype.state.replace(/_/g, " ")}</Badge>
      </div>

      {hype.state === "UNKNOWN" || hype.score === null ? (
        <DataUnavailable reason="Attention could not be classified this scan — neither social nor news data was usable. See the Attention section below for exactly why." />
      ) : (
        <div className={styles.row}>
          <span className={styles.label}>Hype score</span>
          <span className={`${styles.value} mono`}>{hype.score}</span>
        </div>
      )}

      <div className={styles.row}>
        <span className={styles.label}>Social coverage</span>
        {social.state === "AVAILABLE" || social.state === "PARTIAL" ? (
          <Badge tone="positive">{social.state}</Badge>
        ) : (
          <Badge tone="unavailable">{social.state.replace(/_/g, " ")}</Badge>
        )}
      </div>
      <div className={styles.row}>
        <span className={styles.label}>News coverage</span>
        {news.state === "AVAILABLE" || news.state === "PARTIAL" ? (
          <Badge tone="positive">{news.state}</Badge>
        ) : (
          <Badge tone="unavailable">{news.state.replace(/_/g, " ")}</Badge>
        )}
      </div>
    </section>
  );
}
