/**
 * Site identity + indexability, in one place (technical SEO pass, 2026-09-16).
 *
 * Why this is configuration and not a constant: emitting a canonical URL,
 * an `og:url`, or a sitemap entry requires knowing this deployment's real
 * public origin. Hardcoding a domain nobody has registered yet would put a
 * fabricated URL into every page's metadata and into JSON-LD — exactly the
 * kind of invented fact this codebase refuses to produce anywhere else, and
 * actively harmful (a canonical pointing at the wrong origin tells search
 * engines to index someone else's URL).
 *
 * So the rule is explicit and fails safe in both directions:
 *
 * - `HOODFLOW_SITE_URL` set  -> that origin is used for canonicals, OG, and
 *   the sitemap, and the site is indexable.
 * - `HOODFLOW_SITE_URL` unset -> we do not know our own public origin, so we
 *   cannot emit a truthful canonical. The app still runs completely normally;
 *   it just serves `noindex` and a localhost metadata base. This is the
 *   correct behavior for local development and for any preview/staging
 *   deploy that was never given a real URL — it cannot leak into a search
 *   index under a wrong canonical.
 * - `HOODFLOW_NOINDEX=true` -> forces `noindex` even when a site URL *is*
 *   configured. This is the switch for a staging environment that has its
 *   own real domain and must still stay out of the index.
 *
 * DEPLOYMENT NOTE: `HOODFLOW_SITE_URL` must be set in production, or
 * production will correctly-but-undesirably serve `noindex`. It is called
 * out in apps/web/.env.example and README.md for exactly that reason.
 */

export const SITE_NAME = "HoodFlow";

/** Product positioning, reused across metadata, OG, and JSON-LD so they can never drift apart. */
export const SITE_TAGLINE = "Know what's moving before you buy.";

export const SITE_DESCRIPTION =
  "HoodFlow is evidence-driven token intelligence for the Robinhood ecosystem. It reads contract, liquidity, holder, " +
  "historical, news and social data together, shows what changed since the last scan, and labels every conclusion with " +
  "its source, confidence and limitations. Not a trading bot, not a price predictor, not a buy/sell signal.";

const configuredSiteUrl = process.env.HOODFLOW_SITE_URL?.trim();

/** True only when this deployment knows its own public origin and indexing has not been explicitly disabled. */
export const IS_INDEXABLE = Boolean(configuredSiteUrl) && process.env.HOODFLOW_NOINDEX !== "true";

/**
 * Absolute origin used for `metadataBase`, canonicals, OG URLs and the
 * sitemap. Falls back to localhost when unconfigured — paired with
 * `IS_INDEXABLE === false`, so a localhost URL is never advertised to a
 * crawler as canonical.
 */
export const SITE_URL = (configuredSiteUrl ?? "http://localhost:3000").replace(/\/+$/, "");

/** Builds an absolute URL for a site-relative path (leading slash required). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
