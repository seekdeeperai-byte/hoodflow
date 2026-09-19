"use client";

import { useState } from "react";
import type { AdversarialSignal, HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { enumToTitle, formatTimestamp, metricLabel } from "../lib/format";

/**
 * IA layer — "Adversarial Signals" (MANIPULATION_RADAR). Renders
 * `report.adversarial` (packages/core/src/types/adversarial.ts).
 *
 * Deliberate presentation decisions, because this is the one section of the
 * product where alarming design would do real damage:
 *
 * - **No red.** Not one observed pattern here justifies a danger color. The
 *   strongest visual weight any signal gets is the same neutral/accent badge
 *   every other section uses. A user must never come away thinking HoodFlow
 *   called a token a scam, because it did not.
 * - **Patterns that were checked and found absent are shown too**, collapsed
 *   into a quiet line. Hiding them would make the section look like a list of
 *   accusations rather than the output of a fixed checklist.
 * - **Evidence is always visible for an observed pattern**, including the
 *   backend's own caveats, so a reader can disagree with the inference while
 *   still seeing the numbers it came from.
 * - The section renders nothing above a normal card — no flashing, no
 *   interstitial, no "⚠" iconography.
 */

const STATUS_COPY: Record<AdversarialSignal["status"], string> = {
  OBSERVED: "Observed",
  NOT_OBSERVED: "Checked — not present",
  INSUFFICIENT_TEMPORAL_DATA: "Not enough history yet",
  DATA_UNAVAILABLE: "Data unavailable",
};

function formatValue(value: number | null): string {
  if (value === null) return "unavailable";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function AdversarialSignals({ report }: { report: HoodflowReport }) {
  const [showRadarNote, setShowRadarNote] = useState(false);
  const { adversarial } = report;

  const observed = adversarial.signals.filter((s) => s.status === "OBSERVED");
  const checkedAbsent = adversarial.signals.filter((s) => s.status === "NOT_OBSERVED");
  const unevaluated = adversarial.signals.filter(
    (s) => s.status === "INSUFFICIENT_TEMPORAL_DATA" || s.status === "DATA_UNAVAILABLE",
  );

  return (
    <section className={styles.card} aria-labelledby="adversarial-signals-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="adversarial-signals-heading" className={styles.cardTitle}>
            Adversarial Signals
          </h2>
          <p className={styles.muted} style={{ margin: "2px 0 0" }}>
            Patterns that deserve a closer look.
          </p>
        </div>
        <span className={styles.muted}>
          {observed.length} observed &middot; {adversarial.signals.length} checked
        </span>
      </div>

      {observed.length === 0 && (
        <p className={styles.muted} style={{ marginTop: 4 }}>
          No unusual cross-observation pattern was found in what HoodFlow could measure this scan. That is not a
          clean bill of health — it means these specific patterns were not present in the available evidence.
        </p>
      )}

      {observed.map((signal, i) => (
        <div
          key={signal.type}
          style={{
            marginTop: 14,
            paddingBottom: 14,
            borderBottom: i === observed.length - 1 ? "none" : "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <Badge tone="accent">{enumToTitle(signal.type)}</Badge>
            <span className={styles.muted}>{signal.confidence} confidence</span>
            {signal.severity && <span className={styles.muted}>&middot; {enumToTitle(signal.severity)}</span>}
            <span className={styles.muted}>&middot; {signal.source.join(", ")}</span>
          </div>

          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text)" }}>{signal.explanation}</p>

          <div className={styles.muted} style={{ marginBottom: 2 }}>
            Evidence
          </div>
          <ul className={styles.evidenceList}>
            {signal.evidence.map((e, j) => (
              <li key={j}>
                {/*
                 * A point-in-time measurement (no previous value AND no delta —
                 * e.g. current top-10 concentration) is rendered as a single
                 * figure. Showing it as "unavailable -> 61.40" would imply
                 * HoodFlow tried to fetch a previous value and failed, when in
                 * fact this metric is a snapshot reading and was never a
                 * comparison. "Unavailable" has a specific meaning in this
                 * product and must not be spent on a non-comparison.
                 */}
                {metricLabel(e.metric)}:{" "}
                {e.previousValue === null && e.delta === null ? (
                  formatValue(e.currentValue)
                ) : (
                  <>
                    {formatValue(e.previousValue)} &rarr; {formatValue(e.currentValue)}
                  </>
                )}
                {e.delta !== null && ` (change ${formatValue(e.delta)}`}
                {e.delta !== null && e.percentChange !== null && `, ${e.percentChange.toFixed(1)}%`}
                {e.delta !== null && ")"}
                {e.windowStart && (
                  <>
                    {" "}
                    &middot; window {formatTimestamp(e.windowStart)} &rarr; {formatTimestamp(e.observedAt)}
                  </>
                )}
                {e.caveat && <div className={styles.muted} style={{ marginTop: 2 }}>{e.caveat}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {checkedAbsent.length > 0 && (
        <p className={styles.muted} style={{ marginTop: 14 }}>
          Checked and not present: {checkedAbsent.map((s) => enumToTitle(s.type)).join(", ")}.
        </p>
      )}

      {unevaluated.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <DataUnavailable
            reason={`${unevaluated.length} pattern(s) could not be evaluated this scan: ${unevaluated
              .map((s) => `${enumToTitle(s.type)} (${STATUS_COPY[s.status].toLowerCase()})`)
              .join(", ")}. An unevaluated pattern is not the same as an absent one.`}
          />
        </div>
      )}

      {/*
       * "Advanced Intelligence" disclosure. A quiet, opt-in explanation of what
       * this section is and — just as importantly — what it is not. Kept as a
       * plain toggle button rather than anything animated, so it reads as
       * documentation rather than a marketing flourish.
       */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setShowRadarNote((v) => !v)}
          aria-expanded={showRadarNote}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontSize: 12,
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          {showRadarNote ? "Hide" : "Advanced Intelligence"}
        </button>

        {showRadarNote && (
          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Manipulation Radar</div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              HoodFlow looks for unusual relationships between activity, liquidity, holders, social attention,
              timing and identity. When several independent observations move together in a way that does not
              obviously follow from each other, that combination is worth a second look — even when each
              individual measurement looks ordinary on its own.
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              These are signals, not accusations. Every pattern here has ordinary explanations that the available
              evidence cannot rule out, HoodFlow never claims one observation caused another, and nothing in this
              section is a prediction or a recommendation to buy or sell.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
