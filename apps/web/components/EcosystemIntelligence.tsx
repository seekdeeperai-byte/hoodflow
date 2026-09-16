import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { enumToTitle, truncateId } from "../lib/format";

/**
 * IA layer — "Ecosystem Intelligence" (FINAL GAP CLOSURE phase §5). Renders
 * `report.ecosystem` (packages/core/src/types/ecosystem.ts) — the entities
 * connected to this token and the canonical (category: "ECOSYSTEM")
 * relationships that connect them, built by
 * `ecosystem/ecosystem-engine.ts` from data already fetched elsewhere in the
 * pipeline (contract creator, liquidity venue/pair). No relationship is
 * rendered unless the backend attached real evidence to it — this component
 * never infers a connection from a name or symbol on its own.
 */
export function EcosystemIntelligence({ report }: { report: HoodflowReport }) {
  const { ecosystem } = report;
  const otherEntities = ecosystem.entities.filter((e) => e.id !== ecosystem.subject.id);

  return (
    <section className={styles.card} aria-labelledby="ecosystem-intelligence-heading">
      <div className={styles.cardHeader}>
        <h2 id="ecosystem-intelligence-heading" className={styles.cardTitle}>
          Ecosystem Intelligence
        </h2>
        <span className={styles.muted}>{ecosystem.relationships.length} connection(s)</span>
      </div>

      {ecosystem.relationships.length === 0 ? (
        <DataUnavailable
          reason={
            ecosystem.limitations[0] ??
            "No ecosystem connection could be verified for this token this scan — deployer and liquidity-venue data were both unavailable or did not carry real evidence of a connection."
          }
        />
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <div className={styles.muted} style={{ marginBottom: 6 }}>
              Connected entities
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {otherEntities.map((e) => (
                <span key={e.id} title={e.label ?? e.id}>
                  <Badge tone="neutral">
                    {enumToTitle(e.entityType)}: {truncateId(e.label ?? e.id)}
                  </Badge>
                </span>
              ))}
            </div>
          </div>

          {ecosystem.relationships.map((rel, i) => (
            <div
              key={rel.id}
              style={{
                marginBottom: 14,
                paddingBottom: 14,
                borderBottom: i === ecosystem.relationships.length - 1 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <Badge tone="accent">{enumToTitle(rel.relationshipType)}</Badge>
                <span className={styles.muted}>{rel.confidence} confidence</span>
                {rel.object && (
                  <span className={styles.muted} title={rel.object.label ?? rel.object.id}>
                    &middot; {truncateId(rel.object.label ?? rel.object.id)}
                  </span>
                )}
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text)" }}>{rel.interpretation}</p>
              {rel.evidence.length > 0 && (
                <ul className={styles.evidenceList}>
                  {rel.evidence.map((e, j) => (
                    <li key={j}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {ecosystem.limitations.length > 0 && ecosystem.relationships.length > 0 && (
        <ul className={styles.evidenceList} style={{ marginTop: 8 }}>
          {ecosystem.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}

      <p className={styles.muted} style={{ marginTop: 12 }}>
        Connections shown here are backed by real evidence only — HoodFlow never infers a relationship from a
        matching name, symbol, or unverified narrative.
      </p>
    </section>
  );
}
