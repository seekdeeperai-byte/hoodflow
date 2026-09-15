import { SearchBar } from "../components/SearchBar";
import { ReportView } from "../components/ReportView";
import { DEMO_REPORT } from "../lib/sample-report";

/**
 * Landing page. Product principle (per spec): HoodFlow is not a token
 * scanner, it's an intelligence platform — the hero copy and the
 * SCAN -> ANALYZE -> COMPARE -> INTERPRET -> MONITOR flow are stated
 * explicitly rather than implied. The report shown below the search bar is
 * always the hand-written DEMO_REPORT (lib/sample-report.ts), always
 * rendered through the same DataModeBadge-labeled ReportView a real scan
 * uses, so a first-time visitor sees the real UI shape before running one.
 */
export default function HomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
          Know what&apos;s moving before you buy.
        </h1>
        <p style={{ margin: "0 0 4px", color: "var(--text-dim)", fontSize: 15, maxWidth: 640 }}>
          Raw crypto data is easy to find. Contract calls, liquidity pools, holder lists — it&apos;s all public.
          HoodFlow helps you read it.
        </p>
        <p style={{ margin: "16px 0 0", color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Scan → Analyze → Compare → Interpret → Monitor
        </p>
      </section>

      <SearchBar />

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
          Example report
        </h2>
        <ReportView report={DEMO_REPORT} mode="demo" />
      </section>
    </div>
  );
}
