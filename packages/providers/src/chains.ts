/**
 * Chain registry. HOODFLOW starts with the Robinhood ecosystem but is
 * architected to add EVM chains by extending this table — nothing
 * downstream is hardcoded to chain 4663.
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  blockscoutBaseUrl: string;
  /** DexScreener's own chain slug for this chain, when known. */
  dexScreenerSlug?: string;
  /** Whether DexScreener slug support has been confirmed against the live API (see docs/ARCHITECTURE.md §1). */
  dexScreenerSlugVerified: boolean;
}

export const CHAINS: Record<number, ChainConfig> = {
  4663: {
    chainId: 4663,
    name: "Robinhood Chain",
    blockscoutBaseUrl: "https://robinhoodchain.blockscout.com",
    dexScreenerSlug: undefined,
    dexScreenerSlugVerified: false,
  },
  46630: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    blockscoutBaseUrl: "https://explorer.testnet.chain.robinhood.com",
    dexScreenerSlug: undefined,
    dexScreenerSlugVerified: false,
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}
