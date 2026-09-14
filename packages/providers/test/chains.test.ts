import { describe, expect, it } from "vitest";
import { getChainConfig } from "../src/chains.js";

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
});
