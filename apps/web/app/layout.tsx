import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { IS_INDEXABLE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, absoluteUrl } from "../lib/site";

const TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

/**
 * Root metadata (technical SEO pass, 2026-09-16).
 *
 * `title.template` gives every nested route a distinct, non-duplicated title
 * while keeping one consistent brand suffix. `metadataBase` is what lets
 * Next.js resolve any relative metadata URL against this deployment's real
 * origin — without it, canonical tags are not emitted at all, and it is also
 * what nested route segments rely on. `robots` is environment-driven (see lib/site.ts): a deployment
 * that has not been told its own public origin cannot emit a truthful
 * canonical, so it stays out of the index rather than emitting a wrong one.
 *
 * Deliberately absent: any `og:image`/`twitter:image`. There is no real
 * share image in this repository, and pointing at a nonexistent asset would
 * produce a broken social preview — worse than none. Deliberately absent
 * too: any metric, score, or claim about a specific token. Metadata is
 * rendered before any provider data exists, so any number here would be
 * fabricated by definition.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Next normalizes a home-page canonical to the bare origin ("https://host",
  // no trailing slash) whether it is given "/" or an absolute URL. That is
  // equivalent to "https://host/" under RFC 3986 and no search engine treats
  // them as two URLs — but there is still no reason for one site to spell its
  // own home page two ways, so sitemap.ts and the JSON-LD below are aligned to
  // this exact form rather than the other way around. Verified byte-identical
  // across canonical, og:url, JSON-LD and sitemap.xml in the runtime SEO check.
  alternates: { canonical: SITE_URL },
  robots: IS_INDEXABLE
    ? { index: true, follow: true, googleBot: { index: true, follow: true } }
    : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL, // same spelling as the canonical tag and sitemap — see the note above
    locale: "en_US",
  },
  twitter: {
    // "summary" (not summary_large_image): there is no share image, and the
    // large-image card renders poorly without one.
    card: "summary",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  category: "technology",
};

/**
 * JSON-LD. Only two types, both of which describe this page truthfully:
 * `WebSite` (what this site is) and `SoftwareApplication` (what the product
 * is). Deliberately NOT used: Review, Rating, AggregateRating, Product,
 * Article, Organization-with-unverifiable-claims, or any FinancialProduct
 * schema — this repository has no reviews, no ratings, no verified
 * organizational identity and no financial product, so emitting those to
 * chase rich results would be fabricated structured data.
 *
 * `offers: price 0` is an accurate statement about the public token-scan
 * interface, which requires no payment and no account.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#application"),
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      description: SITE_DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
         * JSON.stringify output only — never interpolated user or provider
         * data, so there is no injection surface here. The object above is a
         * static, build-time constant.
         */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <header
            style={{
              borderBottom: "1px solid var(--border)",
              padding: "16px 24px",
              display: "flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.01em" }}>HoodFlow</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Know what&apos;s moving before you buy.</span>
          </header>
          <main style={{ flex: 1, width: "100%", maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }}>
            {children}
          </main>
          <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", color: "var(--text-faint)", fontSize: 12 }}>
            HoodFlow reports on observed on-chain and market data. Nothing here is financial or investment advice.
          </footer>
        </div>
      </body>
    </html>
  );
}
