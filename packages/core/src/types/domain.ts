/**
 * Internal (normalized) data model. Providers never hand raw payloads to
 * analyzers — everything crosses through packages/core/src/normalize/* into
 * these shapes first.
 */

export interface TokenIdentity {
  chainId: number;
  address: string; // lowercase, checksummed at the boundary
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface ContractSecurityData {
  /** GoPlus's own token_name/token_symbol, when reported — contextual identity evidence only, see types/identity.ts. */
  observedName?: string;
  observedSymbol?: string;
  isOpenSource?: boolean;
  isProxy?: boolean;
  isUpgradeable?: boolean;
  ownerAddress?: string | null;
  canTakeBackOwnership?: boolean;
  hiddenOwner?: boolean;
  isMintable?: boolean;
  isHoneypot?: boolean;
  isBlacklisted?: boolean;
  isWhitelisted?: boolean;
  isAntiWhale?: boolean;
  canBePaused?: boolean;
  transferPausable?: boolean;
  tradingCooldown?: boolean;
  buyTaxPct?: number;
  sellTaxPct?: number;
  maxWalletPct?: number;
  maxTxPct?: number;
  holderCount?: number;
  top10HolderPct?: number;
  lpHolderCount?: number;
  lpTotalSupplyPct?: number;
  creatorAddress?: string | null;
  creatorBalancePct?: number;
}

export interface LiquiditySnapshot {
  /** DexScreener's own baseToken.name/symbol, when reported — contextual identity evidence only, see types/identity.ts. */
  observedName?: string;
  observedSymbol?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: number;
  liquidityUsd?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  volumeUsd24h?: number;
  priceChangePct24h?: number;
  buys24h?: number;
  sells24h?: number;
  pairCreatedAt?: string;
}

export interface HolderSummary {
  /** Blockscout's own token.name/symbol, when reported — contextual identity evidence only, see types/identity.ts. */
  observedName?: string;
  observedSymbol?: string;
  holderCount?: number;
  top10Pct?: number;
  top20Pct?: number;
}

/** A point-in-time normalized capture of everything HOODFLOW could gather. */
export interface TokenSnapshot {
  token: TokenIdentity;
  capturedAt: string;
  /** Resolved deterministically from chain + contract address; see types/identity.ts and packages/core/src/identity/resolve-identity.ts. */
  identity: import("./identity.js").IdentityResolution;
  contract: {
    state: import("./data-state.js").DataState;
    data?: ContractSecurityData;
    error?: string;
  };
  liquidity: {
    state: import("./data-state.js").DataState;
    data?: LiquiditySnapshot;
    error?: string;
  };
  holders: {
    state: import("./data-state.js").DataState;
    data?: HolderSummary;
    error?: string;
  };
}
