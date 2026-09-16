import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { enumToTitle, formatTimestamp, truncateId } from "../lib/format";

/**
 * IA layer — "Intelligence Events" (FINAL GAP CLOSURE phase §4). Renders
 * `report.events` (packages/core/src/types/events.ts's `IntelligenceEventFeed`)
 * as a neutral, factual timeline. Every event here was already computed by
 * `events/event-engine.ts` from data other analyzers produced — this
 * component only arranges and labels it, exactly like every other report
 * section in this app.
 *
 * Deliberately never uses "bullish"/"bearish" language or positive/negative
 * badge tones: the spec (§4.4) requires events stay neutral, so every badge
 * here uses the "accent"/"neutral"/"unavailable" tones only, never
 * "positive"/"negative" — those are reserved elsewhere in this app for
 * literal measured up/down deltas, not for framing an event as good or bad.
 */
const STATE_TONE: Record<string, "accent" | "neutral" | "unavailable"> = {
  MEASURED: "accent",
  INFERRED: "accent",
  CONTEXTUAL: "neutral",
  UNAVAILABLE: "unavailable",
  INSUFFICIENT_DATA: "unavailable",
};

export function IntelligenceEvents({ report }: { report: HoodflowReport }) {
  const { events } = report;

  return (
    <section className={styles.card} aria-labelledby="intelligence-events-heading">
      <div className={styles.cardHeader}>
        <h2 id="intelligence-events-heading" className={styles.cardTitle}>
          Intelligence Events
        </h2>
        <span className={styles.muted}>{events.events.length} this scan</span>
      </div>

      {events.events.length === 0 ? (
        <DataUnavailable
          reason={
            events.limitations[0] ??
            "No intelligence event could be measured this scan. This is not evidence that nothing changed — it means no already-computed change met the bar for a factual event this scan."
          }
        />
      ) : (
        events.events.map((event, i) => (
          <div
            key={event.id}
            style={{
              marginBottom: 14,
              paddingBottom: 14,
              borderBottom: i === events.events.length - 1 ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <Badge tone={STATE_TONE[event.state] ?? "neutral"}>{enumToTitle(event.eventType)}</Badge>
              <span className={styles.muted}>{enumToTitle(event.category)}</span>
              <span className={styles.muted}>&middot; {event.significance} significance</span>
              {event.confidence && <span className={styles.muted}>&middot; {event.confidence} confidence</span>}
              <span className={styles.muted}>&middot; {formatTimestamp(event.eventTimestamp)}</span>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{event.summary}</p>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-dim)" }}>{event.description}</p>
            {event.evidence.length > 0 && (
              <ul className={styles.evidenceList}>
                {event.evidence.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            )}
            {event.relatedEntities.length > 0 && (
              <p className={styles.muted} style={{ marginTop: 6 }}>
                Related:{" "}
                {event.relatedEntities.map((e, j) => (
                  <span key={e.id} title={e.label ?? e.id}>
                    {j > 0 ? ", " : ""}
                    {truncateId(e.label ?? e.id)}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))
      )}

      {events.limitations.length > 0 && events.events.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <ul className={styles.evidenceList}>
            {events.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
