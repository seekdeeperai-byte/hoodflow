import { describe, expect, it } from "vitest";
import { CHAINS, getChainConfig } from "../src/chains.js";

describe("chain registry", () => {
  it("locks in the live-verified DexScreener slug for Robinhood Chain mainnet — regression guard against reverting to the wrong Phase 0 guess (see docs/LIVE_VERIFICATION.md)", () => {
    const chain = getChainConfig(4663);
    expect(chain?.dexScreenerSlug).toBe("robinhood");
    expect(chain?.dexScreenerSlugVerified).toBe(true);
    expect(chain?.goPlusSupportVerified).toBe(true);
  });

  it("keeps the testnet's DexScreener slug unverified rather than guessing", () => {
    const chain = getChainConfig(46630);
    expect(chain?.dexScreenerSlug).toBeUndefined();
    expect(chain?.dexScreenerSlugVerified).toBe(false);
  });

  it("returns undefined for an unregistered chain rather than a default/guessed config", () => {
    expect(getChainConfig(1)).toBeUndefined();
  });

  it("every known token carries a source and note — no bare unlabeled addresses", () => {
    const chain = getChainConfig(4663)!;
    expect(chain.knownTokens.length).toBeGreaterThan(0);
    for (const token of chain.knownTokens) {
      expect(token.source).toBeTruthy();
      expect(token.note.length).toBeGreaterThan(10);
    }
  });

  it("Phase 5 security check: no chain's real registry contains a duplicate address, and no entry uses the test_fixture source (that tier is reserved for packages/core/test fixtures only)", () => {
    for (const chain of Object.values(CHAINS)) {
      const addresses = chain.knownTokens.map((t) => t.address.toLowerCase());
      expect(new Set(addresses).size).toBe(addresses.length);
      for (const token of chain.knownTokens) {
        expect(token.source).not.toBe("test_fixture");
      }
    }
  });

  it("USDG carries its live-confirmed name (Global Dollar, per docs/LIVE_VERIFICATION.md) without guessing names for entries that weren't live-verified", () => {
    const chain = getChainConfig(4663)!;
    const usdg = chain.knownTokens.find((t) => t.symbol === "USDG");
    const gme = chain.knownTokens.find((t) => t.symbol === "GME");
    expect(usdg?.name).toBe("Global Dollar");
    expect(gme?.name).toBeUndefined(); // not live-verified — never guessed
  });
});
