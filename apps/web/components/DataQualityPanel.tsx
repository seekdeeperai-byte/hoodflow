import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";

/** IA layer 3 — "Data Quality." Every domain's real DataState, never hidden or collapsed to a single number. */

const STATE_TONE: Record<string, BadgeTone> = {
  AVAILABLE: "positive",
  PARTIAL: "neutral",
  DATA_UNAVAILABLE: "unavailable",
  PROVIDER_UNAVAILABLE: "unavailable",
  INVALID_INPUT: "negative",
  RATE_LIMITED: "neutral",
  ERROR: "negative",
};

const DOMAIN_LABELS: Record<string, string> = {
  contract: "Contract",
  liquidity: "Liquidity",
  holders: "Holders",
  social: "Social",
  news: "News",
};

type DataQualityDomain = "contract" | "liquidity" | "holders" | "social" | "news";

export function DataQualityPanel({ report }: { report: HoodflowReport }) {
  const { dataQuality } = report;
  const domains: DataQualityDomain[] = ["contract", "liquidity", "holders", "social", "news"];

  return (
    <section className={styles.card} aria-labelledby="data-quality-heading">
      <div className={styles.cardHeader}>
        <h2 id="data-quality-heading" className={styles.cardTitle}>
          Data Quality
        </h2>
        {dataQuality.overallConfidencePenalty && (
          <Badge tone="neutral">Confidence penalty: {dataQuality.overallConfidencePenalty}</Badge>
        )}
      </div>

      {domains.map((domain) => {
        const state = dataQuality[domain] as string;
        return (
          <div className={styles.row} key={domain}>
            <span className={styles.label}>{DOMAIN_LABELS[domain]}</span>
            <Badge tone={STATE_TONE[state] ?? "default"}>{state.replace(/_/g, " ")}</Badge>
          </div>
        );
      })}

      <p className={styles.muted} style={{ marginTop: 12 }}>
        A domain marked unavailable is never treated as zero, false, or safe elsewhere in this report — it is
        excluded from analysis and disclosed here instead.
      </p>
    </section>
  );
}
