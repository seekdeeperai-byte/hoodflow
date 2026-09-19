import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Metadata for the Robinhood Ecosystem Pulse route (technical SEO pass,
 * 2026-09-16). Same reasoning as app/report/layout.tsx: the page is a client
 * component, so its metadata lives here, and it is `noindex, follow`
 * because its server-rendered HTML is a loading shell (verified against the
 * real production build) and `:chainId` is an unbounded parameter space.
 *
 * Worth stating explicitly, because it is a product-honesty point and not
 * just an SEO one: the Pulse reports only on tokens HoodFlow has actually
 * scanned, never the whole chain (see docs/ROBINHOOD_ECOSYSTEM_PULSE.md).
 * A search-result snippet has no room for that caveat, so an indexed Pulse
 * page would be one of the easiest places in this product for a reader to
 * come away believing HoodFlow claims chain-wide coverage it does not have.
 */
export const metadata: Metadata = {
  title: "Robinhood Ecosystem Pulse",
  description:
    "Chain-level activity across the tokens HoodFlow has actually scanned on Robinhood Chain — liquidity, holder, " +
    "concentration and identity-coverage dimensions, each reported with its own measured or unavailable state.",
  robots: { index: false, follow: true },
};

export default function PulseLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
