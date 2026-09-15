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
    url: article.url,
    entityMatch: resolveEntityMention(article.title, target, knownTokens),
    sourceQuality: sourceQualityFor(),
    category: classifyCategory(article.title),
  };
}
