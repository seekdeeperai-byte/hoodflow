import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";
import { formatTimestamp } from "../lib/format";

const IDENTITY_TONE: Record<string, BadgeTone> = {
  CONFIRMED: "positive",
  UNVERIFIED: "neutral",
  AMBIGUOUS: "neutral",
  CONFLICTING: "negative",
  UNAVAILABLE: "unavailable",
};

const IDENTITY_COPY: Record<string, string> = {
  CONFIRMED: "Confirmed against HoodFlow's known-token registry.",
  UNVERIFIED: "Not in HoodFlow's registry — insufficient evidence either way. This is not a negative finding.",
  AMBIGUOUS: "Name/symbol context overlaps more than one known contract on this chain — identity is ambiguous.",
  CONFLICTING: "Contextual name/symbol information disagrees with contract-level identity evidence.",
  UNAVAILABLE: "Identity resolution could not run for this address.",
};

export function TokenIdentityCard({ report }: { report: HoodflowReport }) {
  const { token, identity, dataFreshness } = report;
  return (
    <section className={styles.card} aria-labelledby="token-identity-heading">
      <div className={styles.cardHeader}>
        <h2 id="token-identity-heading" className={styles.cardTitle}>
          Token Identity
        </h2>
        <Badge tone={IDENTITY_TONE[identity.status] ?? "default"}>{identity.status}</Badge>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 650 }}>{token.name ?? "Unnamed contract"}</span>
        {token.symbol && (
          <span className="mono" style={{ color: "var(--text-dim)", fontSize: 15 }}>
            {token.symbol}
          </span>
        )}
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Chain ID</span>
        <span className={`${styles.value} mono`}>{token.chainId}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Contract address</span>
        <span className={`${styles.value} mono`} style={{ wordBreak: "break-all", textAlign: "right" }}>
          {token.address}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Observed at</span>
        <span className={styles.value}>{formatTimestamp(dataFreshness.observedAt)}</span>
      </div>

      <p className={styles.muted} style={{ marginTop: 12 }}>
        {IDENTITY_COPY[identity.status]}
      </p>

      {identity.conflicts.length > 0 && (
        <ul className={styles.evidenceList} aria-label="Identity conflicts">
          {identity.conflicts.map((c, i) => (
            <li key={i}>{c.description}</li>
          ))}
        </ul>
      )}

      <p className={styles.muted}>
        Chain + contract address is the authoritative identifier — name and symbol are contextual evidence only and never override it.
      </p>
    </section>
  );
}
