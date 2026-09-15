import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";

/**
 * IA layer 2 — "HOODFLOW Score."
 *
 * Important honesty constraint: the actual backend (`score.dataQualityScore`,
 * see packages/core/src/types/intelligence.ts) is explicitly documented as a
 * "Data-completeness / confidence composite, NOT a buy/sell score" — there is
 * no risk/buy score field anywhere in HoodflowReport. Rather than inventing
 * one to match the spec's "HOODFLOW Score" language, this component presents
 * the two real top-line fields that together stand in for that layer: the
 * deterministic `marketState` read (grounded in
 * packages/core/src/interpretation/market-state.ts — never a prediction,
 * always a description of already-observed signals) and the real data
 * completeness percentage, each clearly labeled for what it actually is.
 */

const MARKET_STATE_TONE: Record<string, BadgeTone> = {
  HEALTHY_FLOW: "positive",
  DEMAND_EXPANSION: "positive",
  ACCUMULATION: "positive",
  SPECULATIVE: "neutral",
  OVERHEATED: "neutral",
  COOLING: "neutral",
  DISTRIBUTION: "negative",
  LIQUIDITY_STRESS: "negative",
  CONTRACT_RISK: "negative",
  INSUFFICIENT_DATA: "unavailable",
};

/** Grounded in the exact conditions in market-state.ts's selectMarketState — descriptive, never predictive. */
const MARKET_STATE_COPY: Record<string, string> = {
  HEALTHY_FLOW: "Liquidity is adequate and no risk or momentum relationship was detected among the current signals.",
  DEMAND_EXPANSION: "Buy-side activity and pooled liquidity appear to be expanding together.",
  ACCUMULATION: "Holder participation is growing while other activity signals stay comparatively steady.",
  SPECULATIVE: "Trading activity appears elevated relative to available liquidity.",
  OVERHEATED: "Activity levels are substantially elevated beyond typical liquidity support.",
  COOLING: "Previously elevated activity appears to be declining.",
  DISTRIBUTION: "Sell-side activity or declining participation dominates the current signals.",
  LIQUIDITY_STRESS: "Liquidity appears to be lagging behind trading activity, with high confidence.",
  CONTRACT_RISK: "A high-severity contract-level risk signal is present and takes precedence over market-activity signals.",
  INSUFFICIENT_DATA: "Not enough signal evidence was available this scan to characterize a market state.",
};

export function ScoreSummary({ report }: { report: HoodflowReport }) {
  const { marketState, score } = report;
  return (
    <section className={styles.card} aria-labelledby="score-summary-heading">
      <div className={styles.cardHeader}>
        <h2 id="score-summary-heading" className={styles.cardTitle}>
          Market State
        </h2>
        <Badge tone={MARKET_STATE_TONE[marketState.state] ?? "default"}>{marketState.state.replace(/_/g, " ")}</Badge>
      </div>

      <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text)" }}>
        {MARKET_STATE_COPY[marketState.state] ?? "State description unavailable."}
      </p>

      <div className={styles.row}>
        <span className={styles.label}>State confidence</span>
        <span className={styles.value}>{marketState.confidence}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Data completeness</span>
        <span className={`${styles.value} mono`}>{score.dataQualityScore}/100</span>
      </div>

      <p className={styles.muted} style={{ marginTop: 12 }}>
        Data completeness reflects how much of this scan&apos;s intended data (contract, liquidity, holders) was
        actually usable — it is not a buy, sell, or risk recommendation. HoodFlow reports on what the data shows;
        it does not tell you what to do with it.
      </p>
    </section>
  );
}
