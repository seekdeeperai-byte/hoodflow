import type { HoodflowReport } from "@hoodflow/core";
import styles from "./ui.module.css";
import { Badge } from "./Badge";
import { DataUnavailable } from "./DataUnavailable";
import { formatTimestamp } from "../lib/format";

const USABLE_STATES = new Set(["AVAILABLE", "PARTIAL"]);

/**
 * Final Intelligence Completion phase §4/§9 — News & Context. Renders
 * syndication-grouped stories (`storyGroups`), not raw article counts, so a
 * single story picked up by ten outlets is shown once with "10 outlets,"
 * never as ten separate items — see
 * packages/core/src/news/news-analyzer.ts.
 *
 * SECURITY: `title` is untrusted external content (a real headline), always
 * rendered as plain JSX text — see SocialIntelligence.tsx's header comment
 * for the same rule applied here.
 */
export function NewsIntelligence({ report }: { report: HoodflowReport }) {
  const { news } = report;
  const usable = USABLE_STATES.has(news.state);

  return (
    <section className={styles.card} aria-labelledby="news-heading">
      <div className={styles.cardHeader}>
        <h2 id="news-heading" className={styles.cardTitle}>
          News &amp; Context
        </h2>
        <Badge tone={usable ? "default" : "unavailable"}>{news.state}</Badge>
      </div>

      {!usable ? (
        <DataUnavailable reason="News data is unavailable for this scan. This means the provider could not be reached — it does not mean no news exists." />
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.label}>Distinct stories</span>
            <span className={styles.value}>{news.storyCount ?? "Unavailable"}</span>
          </div>
          <div className={styles.row} style={{ borderBottom: news.storyGroups.length > 0 ? undefined : "none" }}>
            <span className={styles.label}>Raw articles</span>
            <span className={styles.value}>{news.articleCount ?? "Unavailable"}</span>
          </div>

          {news.storyGroups.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {news.storyGroups.map((group, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: i === news.storyGroups.length - 1 ? "none" : "1px solid var(--border)" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{group.representativeTitle}</p>
                  <div className={styles.muted}>
                    {formatTimestamp(group.firstPublishedAt)} &middot; {group.sources.length} outlet{group.sources.length === 1 ? "" : "s"}
                    {group.memberCount > 1 ? ` (${group.memberCount} articles, syndicated)` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {news.limitations.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className={styles.muted} style={{ marginBottom: 4 }}>
                Limitations
              </div>
              <ul className={styles.evidenceList}>
                {news.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    <div
      style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: "1px solid var(--border)",
        fontSize: 11,
        color: "var(--muted)",
      }}
    >
      News data powered by GDELT.
    </div>
  </section>
  );
}
