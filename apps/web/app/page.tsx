import Link from "next/link";
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
        {/*
         * First-time-user explainer (HOODFLOW MASTERPLUS audit, 2026-09-16):
         * the hero above explains WHAT HoodFlow does, but a first-time
         * visitor skimming for a few seconds had no quick answer to WHY the
         * product works the way it does — why every report re-scans instead
         * of just showing a snapshot, why every claim carries a confidence
         * level, and why "unavailable" shows up constantly instead of being
         * hidden. Those ideas were previously only discoverable by reading
         * the full demo report closely. This is the minimal addition that
         * closes that gap without adding a new section/component.
         */}
        <p style={{ margin: "10px 0 0", color: "var(--text-dim)", fontSize: 13, maxWidth: 640, lineHeight: 1.5 }}>
          Every report compares against HoodFlow&apos;s own prior scans of the same token, not just a single
          snapshot — so &quot;what changed&quot; means something. Every conclusion is labeled with how confident it
          is and where the evidence came from. When something shows as unavailable, that&apos;s not a red flag —
          it just means the data couldn&apos;t be confirmed yet, and HoodFlow says so rather than guessing.
        </p>
      </section>

      <SearchBar />

      <Link href="/pulse/4663" style={{ fontSize: 13, color: "var(--accent)" }}>
        View Robinhood Ecosystem Pulse &rarr;
      </Link>

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
          Example report
        </h2>
        <ReportView report={DEMO_REPORT} mode="demo" />
      </section>
    </div>
  );
}
