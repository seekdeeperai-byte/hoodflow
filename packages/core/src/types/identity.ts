/**
 * Identity resolution types (Phase 5).
 *
 * Contract identity is authoritative: CHAIN + CONTRACT ADDRESS determines
 * what asset HOODFLOW is looking at. Name, symbol, and alias are
 * *contextual evidence* — useful for cross-checking and for surfacing
 * collisions, but never allowed to override a contract-address conclusion.
 * See docs/IDENTITY_RESOLUTION.md for the full design rationale.
 *
 * `KnownToken` lives here (not in packages/providers) even though the
 * registry that holds it (`CHAINS` in packages/providers/src/chains.ts) is
 * provider-adjacent, because `packages/core` has zero dependency on
 * `packages/providers` (providers depends on core, never the reverse) and
 * `resolveIdentity` — a pure, I/O-free computation, exactly like the other
 * analyzers in `core` — needs this shape as an input type. Moving it here
 * instead of duplicating it is what keeps this a single registry model
 * instead of two.
 */

export interface KnownToken {
  address: string;
  symbol: string;
  /**
   * Human-readable project/token name, when independently known — NOT
   * backfilled from unverified provider metadata. Left undefined rather
   * than guessed. See docs/LIVE_VERIFICATION.md for which entries have a
   * live-confirmed name.
   */
  name?: string;
  /**
   * Alternate symbols/tickers this exact address is also known by, when
   * documented. Never populated speculatively — an alias here is
   * contextual evidence for this address, not permission to treat a
   * *different* address sharing the same alias as equivalent.
   */
  aliases?: string[];
  /**
   * How this address was established. See docs/LIVE_VERIFICATION.md for
   * the full trail. `test_fixture` is reserved for synthetic regression
   * fixtures (see packages/core/test/resolve-identity.test.ts) — it must
   * never appear in a real chain registry and is treated as the weakest
   * possible provenance (same confidence tier as `unconfirmed_third_party`)
   * by the resolver.
   */
  source: "official_docs" | "live_confirmed_third_party" | "unconfirmed_third_party" | "test_fixture";
  note: string;
}

export const IdentityStatus = {
  /** Chain + contract address matched a known-token registry entry exactly, with no disagreement from provider-observed data. */
  CONFIRMED: "CONFIRMED",
  /** No exact registry match for this address, and provider-observed name/symbol context overlaps with more than one distinct known address on this chain — cannot tell which, if any, it corresponds to. */
  AMBIGUOUS: "AMBIGUOUS",
  /** Either (a) this exact address has a registry match but provider-observed data disagrees with it, or (b) no exact match exists but provider-observed context points at exactly one different, specific known address. */
  CONFLICTING: "CONFLICTING",
  /** No exact registry match, and no provider-observed context overlapping any known registry entry either. Insufficient evidence either way — not a negative finding. */
  UNVERIFIED: "UNVERIFIED",
  /** Identity resolution could not run at all (e.g. malformed address reaching the resolver directly, bypassing the route's own validation). Distinct from UNVERIFIED, which is a real conclusion. */
  UNAVAILABLE: "UNAVAILABLE",
} as const;
export type IdentityStatus = (typeof IdentityStatus)[keyof typeof IdentityStatus];

export interface IdentityMatch {
  source: KnownToken["source"];
  address: string; // normalized (lowercase)
  symbol: string;
  name?: string;
  note: string;
}

export interface IdentityConflict {
  /** Plain-language, evidence-based, non-accusatory description of the overlap. */
  description: string;
  conflictingAddress: string; // normalized (lowercase)
  conflictingSymbol?: string;
  conflictingSource?: KnownToken["source"];
}

export interface ProviderObservedIdentity {
  provider: string; // "goplus" | "dexscreener" | "blockscout"
  name?: string;
  symbol?: string;
}

export interface IdentityResolution {
  chainId: number;
  contractAddress: string; // normalized (lowercase) — the authoritative key
  status: IdentityStatus;
  /**
   * Identity confidence: confidence that the supplied contract corresponds
   * to the identified project/asset metadata. NOT trading confidence, NOT
   * a risk score. `null` when status is UNVERIFIED/UNAVAILABLE — there is
   * no conclusion to be confident about, so no confidence value is
   * fabricated. Reuses the existing 3-tier `Confidence` (LOW/MEDIUM/HIGH)
   * rather than introducing a parallel 5-tier model — see
   * docs/IDENTITY_RESOLUTION.md for the tier mapping.
   */
  confidence: import("./intelligence.js").Confidence | null;
  /** The registry entry for THIS EXACT address, if any. Never a different address's entry. */
  match: IdentityMatch | null;
  /** Other known-token entries on the SAME chain that share symbol/alias context with this address, but are NOT this address. Populated independently of `status`. */
  conflicts: IdentityConflict[];
  /** Name/symbol as observed directly from providers — contextual evidence, never authoritative on their own. */
  providerObserved: ProviderObservedIdentity[];
  observedAt: string;
}
