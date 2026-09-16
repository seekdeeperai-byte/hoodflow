"use client";

import type { EcosystemPulse as EcosystemPulseType, PulseWindow } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { formatTimestamp, truncateId } from "../lib/format";

/**
 * Robinhood Ecosystem Pulse (FINAL GAP CLOSURE phase §6) — chain-level view.
 * Renders `EcosystemPulse` (packages/core/src/types/pulse.ts) exactly as the
 * backend built it: separate dimension cards (never one opaque "sentiment"
 * score), each honestly labeled MEASURED / MEASURED_ZERO / INSUFFICIENT_HISTORY
 * / DATA_UNAVAILABLE, plus coverage and recent-event summaries. This
 * component never computes a trend or aggregate itself — every number here
 * already came from `pulse-engine.ts`.
 */
const WINDOW_LABEL: Record<PulseWindow, string> = {
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

const DIMENSION_TONE: Record<string, "accent" | "neutral" | "unavailable"> = {
  MEASURED: "accent",
  MEASURED_ZERO: "neutral",
  INSUFFICIENT_HISTORY: "unavailable",
  DATA_UNAVAILABLE: "unavailable",
};

export function EcosystemPulseView({
  pulse,
  window,
  onWindowChange,
}: {
  pulse: EcosystemPulseType;
  window: PulseWindow;
  onWindowChange: (window: PulseWindow) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardTitle} style={{ fontSize: 14 }}>
            {pulse.chainName} — Ecosystem Pulse
          </h1>
          <Badge tone={pulse.dataState === "AVAILABLE" ? "accent" : "unavailable"}>{pulse.dataState}</Badge>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {(Object.keys(WINDOW_LABEL) as PulseWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWindowChange(w)}
              aria-pressed={w === window}
              style={{
                background: w === window ? "var(--accent)" : "var(--surface-2)",
                color: w === window ? "#0a0b0d" : "var(--text)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Chain ID</span>
          <span className={styles.value}>{pulse.chainId}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Known-token registry size</span>
          <span className={styles.value}>{pulse.coverage.registrySize}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Tokens tracked this window</span>
          <span className={styles.value}>{pulse.coverage.trackedTokenCount}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Scans recorded this window</span>
          <span className={styles.value}>{pulse.coverage.scanCount}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Window</span>
          <span className={styles.value}>
            {formatTimestamp(pulse.windowStartedAt)} &rarr; {formatTimestamp(pulse.windowEndedAt)}
          </span>
        </div>

        {pulse.coverage.trackedTokenCount === 0 && (
          <div style={{ marginTop: 14 }}>
            <DataUnavailable reason="No tokens on this chain have been scanned inside the selected window yet. This is not evidence the ecosystem is inactive — it means HOODFLOW has not observed it. Run a scan on a Robinhood Chain token to begin building coverage." />
          </div>
        )}

        {pulse.limitations.length > 0 && (
          <ul className={styles.evidenceList} style={{ marginTop: 12 }}>
            {pulse.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Dimensions</h2>
        </div>
        <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {pulse.dimensions.map((dim) => (
            <div
              key={dim.name}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{dim.label}</span>
                <Badge tone={DIMENSION_TONE[dim.state] ?? "neutral"}>{dim.state}</Badge>
              </div>
              {dim.state === "INSUFFICIENT_HISTORY" || dim.state === "DATA_UNAVAILABLE" ? (
                <p className={styles.muted} style={{ margin: 0 }}>
                  {dim.summary}
                </p>
              ) : (
                <>
                  {dim.value !== undefined && (
                    <span className={styles.value} style={{ fontSize: 18 }}>
                      {dim.value}
                    </span>
                  )}
                  <p className={styles.muted} style={{ margin: 0 }}>
                    {dim.summary}
                  </p>
                  {dim.confidence && <span className={styles.muted}>{dim.confidence} confidence</span>}
                  {dim.sourceCoverage !== undefined && (
                    <span className={styles.muted}>{Math.round(dim.sourceCoverage * 100)}% of tracked tokens contributed</span>
                  )}
                  {dim.details.length > 0 && (
                    <ul className={styles.evidenceList} style={{ marginTop: 0 }}>
                      {dim.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {dim.limitations.length > 0 && (
                <ul className={styles.evidenceList} style={{ marginTop: 0 }}>
                  {dim.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card} style={{ marginBottom: 0 }}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Recent Ecosystem Events</h2>
        </div>
        {pulse.eventSummaries.length === 0 ? (
          <DataUnavailable reason="No intelligence events were observed across tracked tokens in this window." />
        ) : (
          pulse.eventSummaries.map((s, i) => (
            <div className={styles.row} key={i}>
              <span className={styles.label}>{s.eventType.replace(/_/g, " ")}</span>
              <span className={styles.value}>
                {s.count} {s.count === 1 ? "occurrence" : "occurrences"}
                {s.exampleTokenAddresses.length > 0 && (
                  <span className={styles.muted} title={s.exampleTokenAddresses[0]}>
                    {" "}
                    &middot; e.g. {truncateId(s.exampleTokenAddresses[0]!)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </section>

      <p className={styles.muted}>
        Robinhood Ecosystem Pulse is chain-level context, not a market-mood score, and never a trade recommendation.
        It only reflects tokens HOODFLOW has actually scanned inside the selected window.
      </p>
    </div>
  );
}
