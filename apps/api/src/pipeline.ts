import {
  DataState,
  IdentityStatus,
  isUsable,
  resolveIdentity,
  unavailable,
  type ProviderObservedIdentity,
  type TokenIdentity,
  type TokenSnapshot,
  type LiquiditySnapshot,
  type ProviderResult,
} from "@hoodflow/core";
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

  // Provider-observed name/symbol — contextual identity evidence only, gathered here
  // (not inside @hoodflow/core, which has no I/O) from whichever provider domains came
  // back usable. Never fabricated: a provider that returned nothing usable simply
  // contributes nothing to this list. See docs/IDENTITY_RESOLUTION.md.
  const providerObserved: ProviderObservedIdentity[] = [];
  if (isUsable(contract.state) && (contract.data?.observedName || contract.data?.observedSymbol)) {
    providerObserved.push({ provider: "goplus", name: contract.data.observedName, symbol: contract.data.observedSymbol });
  }
  if (isUsable(liquidity.state) && (liquidity.data?.observedName || liquidity.data?.observedSymbol)) {
    providerObserved.push({ provider: "dexscreener", name: liquidity.data.observedName, symbol: liquidity.data.observedSymbol });
  }
  if (isUsable(holders.state) && (holders.data?.observedName || holders.data?.observedSymbol)) {
    providerObserved.push({ provider: "blockscout", name: holders.data.observedName, symbol: holders.data.observedSymbol });
  }

  const normalizedAddress = address.toLowerCase();
  const identity = resolveIdentity(chain?.knownTokens ?? [], chainId, normalizedAddress, providerObserved, capturedAt);

  // TokenIdentity.name/symbol are populated ONLY when identity is CONFIRMED against the
  // registry — i.e. only from data HOODFLOW itself has cross-checked, never from
  // unverified provider claims presented as if authoritative (Phase 5 §4).
  const token: TokenIdentity =
    identity.status === IdentityStatus.CONFIRMED && identity.match
      ? { chainId, address: normalizedAddress, name: identity.match.name, symbol: identity.match.symbol }
      : { chainId, address: normalizedAddress };

  return {
    token,
    capturedAt,
    identity,
    contract: { state: contract.state, data: contract.data, error: contract.error },
    liquidity: { state: liquidity.state, data: liquidity.data, error: liquidity.error },
    holders: { state: holders.state, data: holders.data, error: holders.error },
  };
}
