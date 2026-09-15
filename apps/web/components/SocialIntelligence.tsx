import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";

const USABLE_STATES = new Set(["AVAILABLE", "PARTIAL"]);

/**
 * Final Intelligence Completion phase §3 — Social Signals.
 *
 * SECURITY: `observation.text` is untrusted external content (a real post
 * someone else wrote) — see docs/SECURITY.md §Prompt Injection Resistance.
 * It is rendered here as plain JSX text content only (`{observation.text}`),
 * which React escapes automatically; this file never uses
 * dangerouslySetInnerHTML, never evaluates this text, and never passes it
 * anywhere that could template it into a command or markup. If the text
 * happens to contain something that reads like an instruction, it is
 * displayed as a quoted post, not executed as one.
 */
export function SocialIntelligence({ report }: { report: HoodflowReport }) {
  const { social } = report;
  const usable = USABLE_STATES.has(social.state);

  return (
    <section className={styles.card} aria-labelledby="social-heading">
      <div className={styles.cardHeader}>
        <h2 id="social-heading" className={styles.cardTitle}>
          Social Signals
        </h2>
        <Badge tone={usable ? "default" : "unavailable"}>{social.state}</Badge>
      </div>

      {!usable ? (
        <DataUnavailable reason="Social data is unavailable for this scan. This means the provider could not be reached or authorized — it does not mean social activity is low." />
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.label}>Matching posts</span>
            <span className={styles.value}>{social.postCount ?? "Unavailable"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Unique authors</span>
            <span className={styles.value}>{social.uniqueAuthorCount ?? "Unavailable"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Official posts</span>
            <span className={styles.value}>{social.officialPostCount ?? "Unavailable"}</span>
          </div>
          <div className={styles.row} style={{ borderBottom: social.observations.length > 0 ? undefined : "none" }}>
            <span className={styles.label}>Mention velocity</span>
            <span className={styles.value}>{social.mentionVelocity !== undefined ? `${social.mentionVelocity.toFixed(2)}/hr` : "Unavailable"}</span>
          </div>

          {social.observations.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className={styles.muted} style={{ marginBottom: 6 }}>
                Recent matching posts
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {social.observations.slice(0, 5).map((obs, i) => (
                  <li key={i} style={{ padding: "8px 0", borderBottom: i === Math.min(4, social.observations.length - 1) ? "none" : "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span className={styles.muted}>{obs.authorHandle ? `@${obs.authorHandle}` : "unknown author"}</span>
                      <Badge tone="neutral">{obs.officialClassification}</Badge>
                    </div>
                    {/* Untrusted external text, rendered as plain escaped JSX content — see this file's header. */}
                    {obs.text && <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>{obs.text}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {social.limitations.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className={styles.muted} style={{ marginBottom: 4 }}>
                Limitations
              </div>
              <ul className={styles.evidenceList}>
                {social.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
