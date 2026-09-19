import type { MetadataRoute } from "next";
import { IS_INDEXABLE, absoluteUrl } from "../lib/site";

/**
 * /robots.txt (technical SEO pass, 2026-09-16), served by Next.js's native
 * metadata route rather than a static public/ file so it stays consistent
 * with `lib/site.ts`'s single indexability decision.
 *
 * Important: robots.txt is NOT this codebase's mechanism for keeping the
 * dynamic application routes out of the index. A `Disallow` rule only stops
 * crawling — a disallowed URL can still be indexed (URL-only, from inbound
 * links), and a crawler that cannot fetch the page can never see a `noindex`
 * on it. So `/report/*` and `/pulse/*` are excluded via real `noindex`
 * robots metadata on their own route segments (see their layout.tsx files),
 * and are deliberately left crawlable here so that directive is readable.
 *
 * What IS disallowed below is only the API proxy path: those URLs return
 * JSON, never HTML, have no search value at all, and each `/api/v1/report/*`
 * fetch triggers real upstream provider calls and writes a history record —
 * so letting a crawler walk an unbounded address space there would be both
 * pointless and an abuse-amplification vector.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_INDEXABLE) {
    // Unknown public origin (or explicitly suppressed): keep the whole
    // deployment out of the index. See lib/site.ts for why this fails safe.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
