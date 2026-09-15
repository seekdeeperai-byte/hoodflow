import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { enumToTitle } from "../lib/format";

const STATE_TONE: Record<string, "positive" | "negative" | "neutral" | "accent" | "unavailable"> = {
  QUIET: "neutral",
  EMERGING: "neutral",
  ACCELERATING: "accent",
  HIGH_ATTENTION: "accent",
  EXTREME_ATTENTION: "negative",
  COOLING: "neutral",
  UNKNOWN: "unavailable",
};

/**
 * Final Intelligence Completion phase §5 — Attention/Hype. Deliberately NOT
 * styled or worded as a meme score or a buy/sell signal: no green/red price-
 * style coloring, no "bullish"/"bearish" language anywhere in this
 * component. `report.hype.components`/`reasoning` are rendered directly —
 * this is an analytical breakdown, not a single opaque number.
 */
export function Attention({ report }: { report: HoodflowReport }) {
  const { hype } = report;

  return (
    <section className={styles.card} aria-labelledby="attention-heading">
      <div className={styles.cardHeader}>
        <h2 id="attention-heading" className={styles.cardTitle}>
          Attention
        </h2>
        <Badge tone={STATE_TONE[hype.state] ?? "neutral"}>{enumToTitle(hype.state)}</Badge>
      </div>

      {hype.state === "UNKNOWN" ? (
        <DataUnavailable reason="Attention could not be classified this scan — neither social nor news data was available. This is not the same as attention being low; it is unmeasured." />
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{hype.score !== null ? `${hype.score} / 100` : "Unavailable"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Quality</span>
            <span className={styles.value}>{hype.quality}</span>
          </div>
          <div className={styles.row} style={{ borderBottom: "none" }}>
            <span className={styles.label}>Cross-channel confirmation</span>
            <span className={styles.value}>{hype.confirmation}</span>
          </div>

          {hype.components && (
            <div className={styles.section} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", margin: "0 0 8px" }}>Components</h3>
              {Object.entries(hype.components)
                .filter(([, v]) => v !== undefined)
                .map(([key, value]) => (
                  <div className={styles.row} key={key}>
                    <span className={styles.label}>{enumToTitle(key.replace(/([A-Z])/g, "_$1"))}</span>
                    <span className={styles.value}>{typeof value === "number" ? value.toFixed(2) : String(value)}</span>
                  </div>
                ))}
            </div>
          )}

          {hype.reasoning && hype.reasoning.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className={styles.muted} style={{ marginBottom: 4 }}>
                Why
              </div>
              <ul className={styles.evidenceList}>
                {hype.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.muted} style={{ marginTop: 12 }}>
            This measures observable attention dynamics only — it is not a meme score and not a buy/sell signal.
          </p>
        </>
      )}
    </section>
  );
}
