import { DataState, unavailable, type TokenSnapshot, type LiquiditySnapshot, type ProviderResult } from "@hoodflow/core";
import { getChainConfig, type BlockscoutClient, type DexScreenerClient, type GoPlusClient } from "@hoodflow/providers";

export interface PipelineDeps {
  goplus: GoPlusClient;
  dexscreener: DexScreenerClient;
  blockscout: BlockscoutClient;
}

/**
 * Fetches from every provider in parallel and assembles a normalized
 * TokenSnapshot. No provider failure here ever throws — each client
 * already resolves to a ProviderResult with an explicit DataState, and
 * this function just carries those states through untouched.
 */
export async function fetchSnapshot(deps: PipelineDeps, chainId: number, address: string): Promise<TokenSnapshot> {
  const chain = getChainConfig(chainId);
  const capturedAt = new Date().toISOString();

  const contractPromise = deps.goplus.getTokenSecurity(chainId, address);
  const holdersPromise = deps.blockscout.getHolderSummary(address);
  const liquidityPromise: Promise<ProviderResult<LiquiditySnapshot>> =
    chain?.dexScreenerSlug !== undefined
      ? deps.dexscreener.getTokenLiquidity(chain.dexScreenerSlug, address)
      : Promise.resolve(
          unavailable<LiquiditySnapshot>(
            "dexscreener",
            DataState.DATA_UNAVAILABLE,
            "DexScreener chain slug is not yet confirmed for this chain (see docs/ARCHITECTURE.md).",
          ),
        );

  const [contract, holders, liquidity] = await Promise.all([contractPromise, holdersPromise, liquidityPromise]);

  return {
    token: { chainId, address: address.toLowerCase() },
    capturedAt,
    contract: { state: contract.state, data: contract.data, error: contract.error },
    liquidity: { state: liquidity.state, data: liquidity.data, error: liquidity.error },
    holders: { state: holders.state, data: holders.data, error: holders.error },
  };
}
