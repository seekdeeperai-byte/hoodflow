import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";

/**
 * IA layer 4 — "Current Market / On-Chain Signals" snapshot: the fields
 * that aren't already covered by the per-module breakdown (layer 5) —
 * attention/hype level and social/news coverage. Hype is UNKNOWN in every
 * build today (no hype provider is wired up yet — see docs/ROADMAP.md), so
 * this card will show its real "not implemented" state rather than a fake
 * number; that is expected, not a bug.
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
        <DataUnavailable reason="Attention/hype intelligence is not yet implemented in this build — this is a known gap, not a scan failure." />
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
