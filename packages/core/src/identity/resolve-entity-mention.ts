import type { KnownToken } from "../types/identity.js";
import { EntityMatchBasis, type EntityMatch } from "../types/social-news.js";

/**
 * Entity resolution for social/news observations (Final Intelligence
 * Completion phase §10). Deliberately NOT solely ticker-based — the same
 * "contract beats symbol" principle already established in
 * identity/resolve-identity.ts and proven necessary by the real GME
 * naming-collision case study (docs/IDENTITY_RESOLUTION.md) applies here:
 * a false entity match on an external text field is worse than an honest
 * NO_MATCH, because it would attribute someone else's news/social activity
 * to this token.
 *
 * Pure, no I/O — this only classifies text HOODFLOW's provider clients
 * already fetched; it never fetches anything itself, and it never treats
 * the `text` parameter as anything other than data to pattern-match against
 * (see docs/SECURITY.md §Prompt Injection Resistance — this function does
 * not interpret, execute, or template `text` anywhere).
 */
export function resolveEntityMention(
  text: string | undefined,
  target: { contractAddress: string; officialName?: string; symbol?: string },
  knownTokens: KnownToken[] = [],
): EntityMatch {
  if (!text || text.trim().length === 0) {
    return { basis: EntityMatchBasis.NO_MATCH, note: "No text content was available to check for an entity mention." };
  }

  const haystack = text.toLowerCase();
  const normalizedAddress = target.contractAddress.toLowerCase();

  // Strongest anchor: the literal contract address appearing in the text (e.g. a post/
  // article that names the address directly) — this is never ambiguous.
  if (normalizedAddress.length > 2 && haystack.includes(normalizedAddress)) {
    return {
      basis: EntityMatchBasis.CONTRACT_ADDRESS,
      note: `Text contains this token's exact contract address (${target.contractAddress}).`,
    };
  }

  // Second-strongest: an independently-known official name, whole-word matched, not a substring
  // of an unrelated longer word.
  if (target.officialName) {
    const nameRe = new RegExp(`\\b${escapeRegExp(target.officialName.toLowerCase())}\\b`);
    if (nameRe.test(haystack)) {
      return { basis: EntityMatchBasis.OFFICIAL_NAME, note: `Text contains this token's official name ("${target.officialName}").` };
    }
  }

  // Weakest: a bare symbol/ticker match, optionally prefixed with "$" (common in social
  // posts). Never treated as confirmation on its own — see docs/IDENTITY_RESOLUTION.md's
  // GME case study — so we check whether this exact symbol string is shared by more than
  // one known token on record and downgrade to SYMBOL_AMBIGUOUS when it is.
  if (target.symbol) {
    const symbolRe = new RegExp(`(^|[^a-z0-9])\\$?${escapeRegExp(target.symbol.toLowerCase())}(?![a-z0-9])`, "i");
    if (symbolRe.test(haystack)) {
      const sharedCount = knownTokens.filter((t) => t.symbol.toLowerCase() === target.symbol!.toLowerCase()).length;
      if (sharedCount > 1) {
        return {
          basis: EntityMatchBasis.SYMBOL_AMBIGUOUS,
          note: `Text mentions the symbol "${target.symbol}", but ${sharedCount} distinct known tokens share this exact symbol — a bare ticker match cannot confirm which one this refers to.`,
        };
      }
      return {
        basis: EntityMatchBasis.SYMBOL_UNAMBIGUOUS,
        note: `Text mentions the symbol "${target.symbol}", which is not shared by any other known token on record.`,
      };
    }
  }

  return { basis: EntityMatchBasis.NO_MATCH, note: "Text does not contain this token's contract address, official name, or symbol." };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
