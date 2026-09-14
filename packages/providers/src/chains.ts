/**
 * Chain registry. HOODFLOW starts with the Robinhood ecosystem but is
 * architected to add EVM chains by extending this table — nothing
 * downstream (analyzers, engines, routes) is hardcoded to chain 4663.
 *
 * Every field below carries its own confidence/verification note, per
 * docs/LIVE_VERIFICATION.md. Do not upgrade a field's `verified` flag
 * without a documented live check — that's the entire point of tracking
 * it separately from the value.
 */

export interface KnownToken {
  address: string;
  symbol: string;
  /** How this address was established. See docs/LIVE_VERIFICATION.md for the full trail. */
  source: "official_docs" | "live_confirmed_third_party" | "unconfirmed_third_party";
  note: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  nativeCurrencySymbol: string;
  rpcUrl: string;
  blockscoutBaseUrl: string;
  /** DexScreener's own chain slug for this chain (path segment, not a chain id). */
  dexScreenerSlug?: string;
  /** True only after a live call confirmed this slug returns real pair data — see docs/LIVE_VERIFICATION.md. */
  dexScreenerSlugVerified: boolean;
  /** True only after a live call confirmed GoPlus recognizes this chain id. */
  goPlusSupportVerified: boolean;
  /** A handful of tokens useful for testing/verification, confidence-tiered — never treat as a general token directory. */
  knownTokens: KnownToken[];
}

export const CHAINS: Record<number, ChainConfig> = {
  4663: {
    chainId: 4663,
    name: "Robinhood Chain",
    nativeCurrencySymbol: "ETH",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    blockscoutBaseUrl: "https://robinhoodchain.blockscout.com",
    // Verified live 2026-09-14: /token-pairs/v1/robinhood/{address} returns real pairs;
    // /token-pairs/v1/robinhoodchain/{address} (the Phase 0 guess) returns []. See
    // docs/LIVE_VERIFICATION.md — do not revert this to "robinhoodchain".
    dexScreenerSlug: "robinhood",
    dexScreenerSlugVerified: true,
    // Verified live 2026-09-14: GoPlus's chain list includes "Robinhood (4663)" and a real
    // token_security call for this chain returned populated data. See docs/LIVE_VERIFICATION.md.
    goPlusSupportVerified: true,
    knownTokens: [
      {
        address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
        symbol: "USDG",
        source: "official_docs",
        note: "docs.robinhood.com/chain/contracts; independently confirmed live via GoPlus (341,809 holders). Not expected to have a DEX pair against itself.",
      },
      {
        address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
        symbol: "WETH",
        source: "official_docs",
        note: "docs.robinhood.com/chain/contracts. Contract-security baseline only.",
      },
      {
        address: "0x7e86381A763F0Ecca2bDF27C54eAC403ddD48123",
        symbol: "GME",
        source: "live_confirmed_third_party",
        note:
          "Surfaced via web search (not docs.robinhood.com directly), then independently confirmed live on DexScreener " +
          "(17 pairs, ~$178k liquidity GME/WETH). UNRESOLVED: a separate GME-named memecoin (gme.meme) also appears to " +
          "exist on this chain — this address has NOT been cross-checked against the official stock-token registry. " +
          "Good for exercising the full analyzer pipeline; do not present this as 'the official Robinhood GME token' " +
          "without that cross-check. See docs/LIVE_VERIFICATION.md.",
      },
    ],
  },
  46630: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    nativeCurrencySymbol: "ETH",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    blockscoutBaseUrl: "https://explorer.testnet.chain.robinhood.com",
    dexScreenerSlug: undefined,
    dexScreenerSlugVerified: false,
    goPlusSupportVerified: false,
    knownTokens: [],
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}
