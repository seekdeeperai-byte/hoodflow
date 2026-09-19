import type { MetadataRoute } from "next";
import { IS_INDEXABLE, SITE_URL } from "../lib/site";

/**
 * /sitemap.xml (technical SEO pass, 2026-09-16).
 *
 * Contains exactly one URL, and that is the honest answer rather than a thin
 * one. A sitemap must list canonical, indexable URLs — and the homepage is
 * the only route in this application that is both:
 *
 *  - **Indexable.** `/report/:chainId/:address` and `/pulse/:chainId` are
 *    client-rendered application views. Verified against the real production
 *    build: their server-rendered HTML contains zero `<h1>`/`<h2>` and only a
 *    "Running scan…" loading shell, because the data is fetched in the
 *    browser after hydration. Listing them would be asking search engines to
 *    index a skeleton. They are marked `noindex` on their own route segments
 *    accordingly.
 *  - **Bounded.** Those routes accept any chain id and any 40-hex address, an
 *    effectively infinite URL space. Enumerating the known-token registry
 *    here to pad this file would generate URLs whose content is produced on
 *    demand from live providers and would frequently be an "unavailable"
 *    state — fabricating sitemap entries for SEO is exactly what this
 *    codebase refuses to do everywhere else.
 *
 * If those routes are ever converted to server-rendered pages with real
 * content, they become legitimate candidates for this list — that is a
 * product/architecture decision, not an SEO one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_INDEXABLE) return [];

  return [
    {
      // `SITE_URL` (bare origin), not `absoluteUrl("/")`: matches the exact
      // spelling Next emits for the canonical tag and og:url. See app/layout.tsx.
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
