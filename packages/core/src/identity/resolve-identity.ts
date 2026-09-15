import { Confidence } from "../types/intelligence.js";
import {
  IdentityStatus,
  type IdentityConflict,
  type IdentityResolution,
  type KnownToken,
  type ProviderObservedIdentity,
} from "../types/identity.js";

/**
 * Duplicated intentionally, not shared: packages/core has zero dependency
 * on packages/providers (providers depends on core, never the reverse),
 * and this is a single literal regex, not a system — see
 * packages/providers/src/validate.ts for the copy actually used at the
 * HTTP boundary, which is what real requests are validated against before
 * this function is ever reached in production.
 */
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function confidenceForSource(source: KnownToken["source"]): Confidence {
  switch (source) {
    case "official_docs":
      return Confidence.HIGH;
    case "live_confirmed_third_party":
      return Confidence.MEDIUM;
    case "unconfirmed_third_party":
    case "test_fixture":
      // test_fixture is treated identically to unconfirmed_third_party: the weakest
      // provenance tier. It should never appear in a real chain registry (see
      // KnownToken.source doc comment) — this mapping only matters for direct unit
      // tests of this function.
      return Confidence.LOW;
  }
}

/**
 * Deterministic identity resolution (Phase 5). Pure function, no I/O —
 * mirrors every other analyzer in packages/core/src/analyzers/.
 *
 * `knownTokens` is expected to already be scoped to a single chain (the
 * caller passes `getChainConfig(chainId)?.knownTokens`), so a match against
 * one chain's registry can never leak across chains — chain-mismatch
 * invalidation happens by construction, not by an extra check here.
 *
 * Matching priority (see docs/IDENTITY_RESOLUTION.md §"Matching priority"
 * for the full rationale):
 *   1. Exact chain + normalized contract address match against the
 *      registry — authoritative. Symbol/name/alias are NEVER consulted to
 *      override this, only to detect collisions and disagreements
 *      alongside it.
 *   2. When there is no exact address match, provider-observed name/symbol
 *      context is checked against *other* registry entries' symbol/alias
 *      purely to explain what's going on (AMBIGUOUS vs CONFLICTING vs
 *      UNVERIFIED) — never to assign this address someone else's identity.
 */
export function resolveIdentity(
  knownTokens: KnownToken[],
  chainId: number,
  address: string,
  providerObserved: ProviderObservedIdentity[] = [],
  now: string = new Date().toISOString(),
): IdentityResolution {
  const normAddr = address.toLowerCase();

  if (!EVM_ADDRESS_RE.test(address)) {
    return {
      chainId,
      contractAddress: normAddr,
      status: IdentityStatus.UNAVAILABLE,
      confidence: null,
      match: null,
      conflicts: [],
      providerObserved,
      observedAt: now,
    };
  }

  const exact = knownTokens.find((t) => t.address.toLowerCase() === normAddr);

  // Symbols this address is contextually associated with: its own registry
  // symbol (if any) plus every provider-observed symbol. Used ONLY to look
  // for OTHER, different-address registry entries that share this context —
  // never to establish this address's own identity (rule: contract beats
  // symbol/name/alias, always).
  const contextSymbols = new Set<string>();
  if (exact?.symbol) contextSymbols.add(exact.symbol.toLowerCase());
  for (const p of providerObserved) {
    if (p.symbol) contextSymbols.add(p.symbol.toLowerCase());
  }

  const others = knownTokens.filter((t) => {
    if (t.address.toLowerCase() === normAddr) return false;
    if (contextSymbols.has(t.symbol.toLowerCase())) return true;
    if (t.aliases?.some((a) => contextSymbols.has(a.toLowerCase()))) return true;
    return false;
  });

  const conflicts: IdentityConflict[] = others.map((o) => ({
    description:
      `Another known token on chain ${chainId} uses the symbol "${o.symbol}" at a different contract ` +
      `address (${o.address}) — registry source: ${o.source}. A shared symbol does not establish that ` +
      `these are the same asset.`,
    conflictingAddress: o.address.toLowerCase(),
    conflictingSymbol: o.symbol,
    conflictingSource: o.source,
  }));

  // Does provider-observed data for THIS exact address disagree with what our
  // own registry says this address is? Rare, but must never be silently
  // ignored in favor of the registry's own claim.
  const exactMismatch =
    exact !== undefined && providerObserved.some((p) => p.symbol !== undefined && p.symbol.toLowerCase() !== exact.symbol.toLowerCase());

  if (exact && !exactMismatch) {
    return {
      chainId,
      contractAddress: normAddr,
      status: IdentityStatus.CONFIRMED,
      confidence: confidenceForSource(exact.source),
      match: { source: exact.source, address: normAddr, symbol: exact.symbol, name: exact.name, note: exact.note },
      conflicts,
      providerObserved,
      observedAt: now,
    };
  }

  if (exact && exactMismatch) {
    // Contract-level identity is still authoritative (this IS a registry-known
    // address), but the disagreement itself is real and reportable — never
    // silently prefer the provider's claim over the registry, or vice versa.
    return {
      chainId,
      contractAddress: normAddr,
      status: IdentityStatus.CONFLICTING,
      confidence: Confidence.LOW,
      match: { source: exact.source, address: normAddr, symbol: exact.symbol, name: exact.name, note: exact.note },
      conflicts,
      providerObserved,
      observedAt: now,
    };
  }

  // No exact registry match for this address.
  if (others.length === 1) {
    // Context points at exactly one different, specific known address — a real,
    // nameable contradiction, not mere ambiguity.
    return {
      chainId,
      contractAddress: normAddr,
      status: IdentityStatus.CONFLICTING,
      confidence: null,
      match: null,
      conflicts,
      providerObserved,
      observedAt: now,
    };
  }

  if (others.length > 1) {
    // Context overlaps multiple distinct known addresses — genuinely cannot
    // tell which, if any, this corresponds to. Never guess.
    return {
      chainId,
      contractAddress: normAddr,
      status: IdentityStatus.AMBIGUOUS,
      confidence: null,
      match: null,
      conflicts,
      providerObserved,
      observedAt: now,
    };
  }

  return {
    chainId,
    contractAddress: normAddr,
    status: IdentityStatus.UNVERIFIED,
    confidence: null,
    match: null,
    conflicts: [],
    providerObserved,
    observedAt: now,
  };
}
