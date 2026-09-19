import { resolveEntityMention, SourceQuality, type KnownToken, type NewsObservation } from "@hoodflow/core";
import type { GdeltArticle } from "./schema.js";

/** GDELT's `seendate` is UTC "YYYYMMDDHHMMSS" — converted to ISO 8601, or undefined if malformed. */
function parseSeenDate(seendate: string | undefined): string | undefined {
  if (!seendate) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(seendate);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/**
 * Deterministic, keyword-based event classification — never an LLM
 * sentiment label presented as fact (governing spec §4). First-pass and
 * documented, like every other threshold in this codebase; a headline that
 * matches none of these patterns is honestly GENERAL, not guessed further.
 */
function classifyCategory(title: string): NewsObservation["category"] {
  const t = title.toLowerCase();
  if (/regulat|\bsec\b|lawsuit|compliance|sanction/.test(t)) return "REGULATORY";
  if (/\bannounc|launch(es|ed)?|partnership|integrat/.test(t)) return "ANNOUNCEMENT";
  if (/price|market cap|trading|surge|rally|plunge|volume/.test(t)) return "MARKET_COVERAGE";
  return "GENERAL";
}

/**
 * GDELT indexes established news outlets, not arbitrary web pages, so a
 * successfully-returned article is at minimum ESTABLISHED_PUBLISHER — never
 * OFFICIAL, since GDELT has no concept of "this domain belongs to the
 * project itself" (that would need a separate, explicit allowlist this
 * codebase does not maintain — never guessed).
 */
function sourceQualityFor(): SourceQuality {
  return SourceQuality.ESTABLISHED_PUBLISHER;
}

/**
 * SECURITY HARDENING (2026-09-16): `article.url` is untrusted third-party
 * input — GDELT hands us whatever string it indexed, and the schema only
 * required "a string". That value is served verbatim on the public API as
 * `NewsObservation.url`. Today nothing renders it as a link (apps/web has
 * exactly three hardcoded internal `<Link href>`s and renders all external
 * text as escaped JSX), so there is no live XSS — but a value like
 * `javascript:...` or `data:text/html,...` sitting in a public API payload
 * is a loaded gun pointed at the next consumer that does render it, whether
 * that is a future HOODFLOW UI change or a third-party client of this API.
 * Validating the scheme here — at the same boundary that already drops
 * articles missing a title/date rather than guessing at them — keeps that
 * class of bug structurally impossible instead of relying on every future
 * consumer to remember. A dropped URL becomes `undefined` ("no usable
 * link"), never a fabricated one, and never changes whether the article
 * itself is counted: the observation is still real, it just carries no link.
 */
function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined; // not a parseable absolute URL — no link rather than a broken/hostile one
  }
}

export function normalizeGdeltArticle(
  article: GdeltArticle,
  target: { contractAddress: string; officialName?: string; symbol?: string },
  knownTokens: KnownToken[],
): NewsObservation | undefined {
  const publishedAt = parseSeenDate(article.seendate);
  if (!article.title || !publishedAt) return undefined; // cannot normalize without both — never guessed
  return {
    source: article.domain ?? "unknown",
    title: article.title,
    publishedAt,
    url: safeHttpUrl(article.url),
    entityMatch: resolveEntityMention(article.title, target, knownTokens),
    sourceQuality: sourceQualityFor(),
    category: classifyCategory(article.title),
  };
}
