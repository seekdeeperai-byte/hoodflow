import type { LiquiditySnapshot } from "@hoodflow/core";
import type { DexScreenerPair } from "./schema.js";

/** Picks the deepest-liquidity pair as the representative one for the token. */
export function pickPrimaryPair(pairs: DexScreenerPair[]): DexScreenerPair | undefined {
  if (pairs.length === 0) return undefined;
  return [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

export function normalizeDexScreenerPair(pair: DexScreenerPair): LiquiditySnapshot {
  const buys = pair.txns?.h24?.buys;
  const sells = pair.txns?.h24?.sells;
  return {
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    priceUsd: pair.priceUsd !== undefined ? Number(pair.priceUsd) : undefined,
    liquidityUsd: pair.liquidity?.usd,
    fdvUsd: pair.fdv,
    marketCapUsd: pair.marketCap,
    volumeUsd24h: pair.volume?.h24,
    priceChangePct24h: pair.priceChange?.h24,
    buys24h: buys,
    sells24h: sells,
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : undefined,
  };
}
