import { describe, expect, it } from "vitest";
import { resolveIdentity } from "../src/identity/resolve-identity.js";
import { IdentityStatus, type KnownToken } from "../src/types/identity.js";

const CHAIN_ID = 4663;
const now = "2026-09-15T00:00:00.000Z";

describe("resolveIdentity — basics", () => {
  it("returns CONFIRMED with HIGH confidence for an exact official_docs match", () => {
    const registry: KnownToken[] = [
      { address: "0xAAAA00000000000000000000000000000000AAAA", symbol: "USDG", name: "Global Dollar", source: "official_docs", note: "x" },
    ];
    const r = resolveIdentity(registry, CHAIN_ID, "0xAAAA00000000000000000000000000000000AAAA", [], now);
    expect(r.status).toBe(IdentityStatus.CONFIRMED);
    expect(r.confidence).toBe("HIGH");
    expect(r.match?.symbol).toBe("USDG");
    expect(r.match?.name).toBe("Global Dollar");
    expect(r.conflicts).toHaveLength(0);
  });

  it("returns CONFIRMED with MEDIUM confidence for live_confirmed_third_party, LOW for unconfirmed_third_party", () => {
    const registry: KnownToken[] = [
      { address: "0x111100000000000000000000000000000000AAAA", symbol: "A", source: "live_confirmed_third_party", note: "x" },
      { address: "0x222200000000000000000000000000000000BBBB", symbol: "B", source: "unconfirmed_third_party", note: "x" },
    ];
    expect(resolveIdentity(registry, CHAIN_ID, "0x111100000000000000000000000000000000AAAA", [], now).confidence).toBe("MEDIUM");
    expect(resolveIdentity(registry, CHAIN_ID, "0x222200000000000000000000000000000000BBBB", [], now).confidence).toBe("LOW");
  });

  it("normalizes checksummed mixed-case registry addresses against a lowercase query address", () => {
    // Regression: packages/providers/src/chains.ts stores real registry addresses in
    // checksummed mixed case; pipeline.ts always normalizes the query address to
    // lowercase before calling this function. A naive === comparison would silently
    // never match anything real.
    const registry: KnownToken[] = [
      { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", source: "official_docs", note: "x" },
    ];
    const r = resolveIdentity(registry, CHAIN_ID, "0x5fc5360d0400a0fd4f2af552add042d716f1d168", [], now);
    expect(r.status).toBe(IdentityStatus.CONFIRMED);
  });

  it("returns UNVERIFIED (not a negative finding) for an address with no registry match and no overlapping context", () => {
    const registry: KnownToken[] = [
      { address: "0x111100000000000000000000000000000000AAAA", symbol: "A", source: "official_docs", note: "x" },
    ];
    const r = resolveIdentity(registry, CHAIN_ID, "0x999900000000000000000000000000000000ffff", [], now);
    expect(r.status).toBe(IdentityStatus.UNVERIFIED);
    expect(r.confidence).toBeNull();
    expect(r.match).toBeNull();
    expect(r.conflicts).toHaveLength(0);
  });

  it("returns UNAVAILABLE for a malformed address rather than throwing or guessing", () => {
    const r = resolveIdentity([], CHAIN_ID, "not-an-address", [], now);
    expect(r.status).toBe(IdentityStatus.UNAVAILABLE);
    expect(r.confidence).toBeNull();
  });

  it("chain-scoping: an address that matches a DIFFERENT chain's registry is not found when that chain's registry isn't passed in", () => {
    // resolveIdentity always receives one chain's knownTokens already scoped by the
    // caller (pipeline.ts passes getChainConfig(chainId)?.knownTokens) — cross-chain
    // leakage is impossible by construction. This test locks that in explicitly.
    const chain4663Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
    const testnetRegistry: KnownToken[] = []; // chain 46630 has no known tokens
    const r = resolveIdentity(testnetRegistry, 46630, chain4663Address.toLowerCase(), [], now);
    expect(r.status).toBe(IdentityStatus.UNVERIFIED);
  });
});

describe("resolveIdentity — priority: contract beats symbol/name/alias", () => {
  const officialA: KnownToken = {
    address: "0xA00000000000000000000000000000000000000A",
    symbol: "GME",
    name: "GameStop Stock Token",
    source: "live_confirmed_third_party",
    note: "official-ish GME",
  };
  const otherB: KnownToken = {
    address: "0xB00000000000000000000000000000000000000B",
    symbol: "GME",
    aliases: ["GAMESTONK"],
    source: "test_fixture",
    note: "synthetic second GME for regression testing only — not a real observed address",
  };
  const registry = [officialA, otherB];

  it("resolves address A to A's own identity even when provider context also says GME (matches, not overridden)", () => {
    const r = resolveIdentity(registry, CHAIN_ID, officialA.address.toLowerCase(), [{ provider: "dexscreener", symbol: "GME" }], now);
    expect(r.status).toBe(IdentityStatus.CONFIRMED);
    expect(r.match?.address).toBe(officialA.address.toLowerCase());
    expect(r.match?.symbol).toBe("GME");
  });

  it("does not let a provider-observed symbol override the contract's own registry entry even when it disagrees", () => {
    const r = resolveIdentity(registry, CHAIN_ID, officialA.address.toLowerCase(), [{ provider: "dexscreener", symbol: "NOTGME" }], now);
    // Contract is still recognized (exact match exists) — but the disagreement is real and must surface.
    expect(r.status).toBe(IdentityStatus.CONFLICTING);
    expect(r.match?.address).toBe(officialA.address.toLowerCase()); // still A, never silently reassigned
  });

  it("a provider-observed NAME does not override contract-level identity either", () => {
    const r = resolveIdentity(registry, CHAIN_ID, officialA.address.toLowerCase(), [{ provider: "goplus", name: "Totally Different Project" }], now);
    // name mismatches are contextual only — analyzeIdentity/resolveIdentity's exactMismatch
    // check is symbol-based (the field the registry actually models); a provider name alone
    // never reassigns or invalidates the contract-level match.
    expect(r.status).toBe(IdentityStatus.CONFIRMED);
    expect(r.match?.address).toBe(officialA.address.toLowerCase());
  });

  it("an alias on a DIFFERENT address does not override this address's own contract-level identity", () => {
    // Querying B directly: B's own alias "GAMESTONK" is part of B's own context, not
    // something that could ever reassign B's identity to A — contract (address) already
    // is B's identity here, aliases only ever matter for collision detection against
    // OTHER addresses.
    const r = resolveIdentity(registry, CHAIN_ID, otherB.address.toLowerCase(), [{ provider: "dexscreener", symbol: "GAMESTONK" }], now);
    expect(r.match?.address).toBe(otherB.address.toLowerCase());
  });
});

describe("resolveIdentity — GME collision (real Phase 4 finding, permanent regression fixture)", () => {
  // Phase 4 (docs/LIVE_VERIFICATION.md) found a REAL naming collision risk on Robinhood
  // Chain: an official-ish GME stock token (address confirmed live via DexScreener,
  // packages/providers/src/chains.ts, source: live_confirmed_third_party) and a
  // separately-existing "gme.meme" memecoin also using the GME name/ticker
  // (docs.robinhood.com itself warns: "a token with a matching name/ticker but a
  // different contract address is not a Robinhood Stock Token").
  //
  // The real gme.meme contract address could not be independently verified in Phase 4
  // OR Phase 5 (WebFetch was rate-limited during Phase 5's research pass) — so per the
  // "no fabricated identity" rule, this fixture uses a clearly-labeled TEST FIXTURE
  // address (source: "test_fixture") for the second GME instead of guessing a real one.
  // This proves the resolver's collision/priority/no-accusation behavior against the
  // real structural shape of the problem without asserting an unverified real address
  // as fact. See docs/IDENTITY_RESOLUTION.md.
  const officialGme: KnownToken = {
    address: "0x7e86381A763F0Ecca2bDF27C54eAC403ddD48123", // the real chains.ts GME address
    symbol: "GME",
    source: "live_confirmed_third_party",
    note: "Robinhood Chain GME stock token, per packages/providers/src/chains.ts.",
  };
  const otherGme: KnownToken = {
    address: "0x0000000000000000000000000000000000000BEE", // synthetic — NOT a real observed contract
    symbol: "GME",
    source: "test_fixture",
    note: "TEST FIXTURE representing the real, structurally-confirmed-but-address-unverified gme.meme collision risk documented in docs/LIVE_VERIFICATION.md. Not a real on-chain address.",
  };
  const registry = [officialGme, otherGme];

  it("1. both GME identities can coexist in the registry without error", () => {
    expect(() => resolveIdentity(registry, CHAIN_ID, officialGme.address.toLowerCase(), [], now)).not.toThrow();
    expect(() => resolveIdentity(registry, CHAIN_ID, otherGme.address.toLowerCase(), [], now)).not.toThrow();
  });

  it("2/3/4/5. contract + chain has priority — symbol/name/alias never override which address's identity is returned", () => {
    const rA = resolveIdentity(registry, CHAIN_ID, officialGme.address.toLowerCase(), [{ provider: "dexscreener", symbol: "GME", name: "GameStop on Robinhood Chain" }], now);
    const rB = resolveIdentity(registry, CHAIN_ID, otherGme.address.toLowerCase(), [{ provider: "dexscreener", symbol: "GME", name: "GameStop on Robinhood Chain" }], now);
    expect(rA.match?.address).toBe(officialGme.address.toLowerCase());
    expect(rA.match?.source).toBe("live_confirmed_third_party");
    expect(rB.match?.address).toBe(otherGme.address.toLowerCase());
    expect(rB.match?.source).toBe("test_fixture");
    // The two never get conflated into a single identity despite the identical symbol.
    expect(rA.match?.address).not.toBe(rB.match?.address);
  });

  it("6. collision is detected in both directions", () => {
    const rA = resolveIdentity(registry, CHAIN_ID, officialGme.address.toLowerCase(), [], now);
    const rB = resolveIdentity(registry, CHAIN_ID, otherGme.address.toLowerCase(), [], now);
    expect(rA.conflicts).toHaveLength(1);
    expect(rA.conflicts[0]?.conflictingAddress).toBe(otherGme.address.toLowerCase());
    expect(rB.conflicts).toHaveLength(1);
    expect(rB.conflicts[0]?.conflictingAddress).toBe(officialGme.address.toLowerCase());
  });

  it("an unrelated third address whose provider metadata claims GME cannot be resolved to either — AMBIGUOUS, never a guess", () => {
    const thirdAddress = "0xC00000000000000000000000000000000000000C";
    const r = resolveIdentity(registry, CHAIN_ID, thirdAddress.toLowerCase(), [{ provider: "dexscreener", symbol: "GME" }], now);
    expect(r.status).toBe(IdentityStatus.AMBIGUOUS);
    expect(r.match).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.conflicts).toHaveLength(2);
  });

  it("9. the system's own description text makes no accusation, only a factual, symbol-does-not-establish-sameness statement", () => {
    const rA = resolveIdentity(registry, CHAIN_ID, officialGme.address.toLowerCase(), [], now);
    const text = rA.conflicts[0]?.description ?? "";
    expect(text.toLowerCase()).not.toMatch(/scam|fraud|malicious|fake|rug/);
    expect(text).toMatch(/does not establish/i);
  });
});

describe("resolveIdentity — CONFLICTING when context points at exactly one different known address (no exact match)", () => {
  it("no exact match, exactly one other registry entry shares the observed symbol -> CONFLICTING", () => {
    const registry: KnownToken[] = [
      { address: "0xD00000000000000000000000000000000000000D", symbol: "ACME", source: "official_docs", note: "x" },
    ];
    const impostor = "0xE00000000000000000000000000000000000000E";
    const r = resolveIdentity(registry, CHAIN_ID, impostor.toLowerCase(), [{ provider: "goplus", symbol: "ACME" }], now);
    expect(r.status).toBe(IdentityStatus.CONFLICTING);
    expect(r.match).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]?.conflictingSymbol).toBe("ACME");
  });
});
