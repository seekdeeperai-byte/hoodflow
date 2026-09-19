import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Metadata for the token report route (technical SEO pass, 2026-09-16).
 *
 * The page itself is a client component (it fetches per-token intelligence
 * in the browser), so it cannot export `metadata` — this server-component
 * layout in the same segment is where the route's metadata belongs.
 *
 * `noindex, follow` is a deliberate, evidence-based decision, not an
 * oversight:
 *
 *  1. Verified against the real production build, the server-rendered HTML
 *     for this route is a loading shell — zero headings, no report content —
 *     because every value is fetched client-side after hydration. Indexing it
 *     would put an empty skeleton in search results under a token's name.
 *  2. The route accepts any chain id and any 40-hex address: an unbounded URL
 *     space that would otherwise produce near-infinite duplicate-title,
 *     thin-content pages — a textbook crawl trap.
 *  3. Each crawl would trigger real upstream provider calls and write a
 *     history record for an address nobody asked about, polluting the
 *     Ecosystem Pulse's own "tokens actually scanned" coverage figure with
 *     crawler traffic.
 *
 * `follow` is kept so the "← New scan" link back to the indexable homepage
 * still passes normally. The route stays fully crawlable in robots.txt on
 * purpose — a crawler must be able to fetch the page to see this directive.
 */
export const metadata: Metadata = {
  title: "Token intelligence report",
  description:
    "A HoodFlow token intelligence report: contract, liquidity, holder, historical and external-context evidence for a " +
    "single token, with explicit confidence and limitations on every conclusion.",
  robots: { index: false, follow: true },
};

export default function ReportLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
