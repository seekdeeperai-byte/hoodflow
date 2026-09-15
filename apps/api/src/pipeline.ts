import {
  DataState,
  IdentityStatus,
  isUsable,
  resolveIdentity,
  unavailable,
  type NewsObservation,
  type ProviderObservedIdentity,
  type SocialObservation,
  type TokenIdentity,
  type TokenSnapshot,
  type LiquiditySnapshot,
  type HolderSummary,
  type ProviderResult,
} from "@hoodflow/core";
import {
  getChainConfig,
  type BlockscoutClient,
  type DexScreenerClient,
  type GdeltNewsClient,
  type GoPlusClient,
  type XSocialClient,
} from "@hoodflow/providers";

export interface PipelineDeps {
  goplus: GoPlusClient;
  dexscreener: DexScreenerClient;
  blockscout: BlockscoutClient;
  /**
   * Phase 11 fix: `blockscout` is a single client instance scoped to one
   * chain's explorer base URL (Blockscout is deployed per-chain — see
   * `BlockscoutClient`'s own doc comment). Before this field existed,
   * `fetchSnapshot` called it unconditionally for every registered chain,
   * including chain 46630 (testnet — it IS in the chain registry, so it
   * passes the route's chain-existence check), which meant a request for
   * that chain would silently query the *mainnet* explorer and could
   * return real holder data for an unrelated mainnet contract, misattributed
   * to a testnet chain's report. This field records which chain the
   * `blockscout` client above was actually constructed for, so
   * `fetchSnapshot` can gate on it the same way it already gates
   * DexScreener behind `dexScreenerSlugVerified`. See docs/DATA_SOURCES.md.
   */
  blockscoutChainId: number;
  /**
   * Social + News (Final Intelligence Completion phase). Optional —
   * omitting either keeps every pre-existing caller of `fetchSnapshot`
   * (including `apps/api/test/report.route.test.ts`'s mocks, which predate
   * this phase) compiling and behaving exactly as before: an omitted client
   * resolves to PROVIDER_UNAVAILABLE without any network call, the same
   * "not configured" gating pattern already used for `blockscoutChainId`
   * above and for `dexScreenerSlug` in `getChainConfig`.
   */
  social?: XSocialClient;
  news?: GdeltNewsClient;
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
  const holdersPromise: Promise<ProviderResult<HolderSummary>> =
    chainId === deps.blockscoutChainId
      ? deps.blockscout.getHolderSummary(address)
      : Promise.resolve(
          unavailable<HolderSummary>(
            "blockscout",
            DataState.DATA_UNAVAILABLE,
            `Blockscout is only configured for chain ${deps.blockscoutChainId} in this build; holder data for chain ${chainId} is not available yet (see docs/DATA_SOURCES.md).`,
          ),
        );
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

  // Final Intelligence Completion phase: social + news. Deliberately fetched AFTER identity
  // resolution above (not in parallel with contract/liquidity/holders) because the query text
  // is built from the resolved identity's official name/symbol when available — querying by a
  // confirmed name/symbol is a materially better search than querying by a bare address, and
  // getting this wrong risks a false entity match (§10: worse than no match at all).
  const entityTarget = {
    contractAddress: normalizedAddress,
    officialName: identity.status === IdentityStatus.CONFIRMED ? identity.match?.name : undefined,
    symbol: identity.status === IdentityStatus.CONFIRMED ? identity.match?.symbol : undefined,
  };
  const searchQuery = entityTarget.officialName ?? entityTarget.symbol ?? normalizedAddress;
  const knownTokens = chain?.knownTokens ?? [];

  // "This build/deployment never wired up a client at all" is DATA_UNAVAILABLE, matching the
  // existing DexScreener-slug/Blockscout-chain "not configured for this build" convention
  // above — distinct from PROVIDER_UNAVAILABLE, which XSocialClient itself already returns
  // when a client exists but its credential (X_BEARER_TOKEN) is missing (see its own doc
  // comment). The real server (server.ts) always constructs both clients, so this branch is
  // primarily exercised by tests that construct PipelineDeps without them.
  const socialPromise: Promise<ProviderResult<SocialObservation[]>> = deps.social
    ? deps.social.searchRecentPosts(searchQuery, entityTarget, knownTokens)
    : Promise.resolve(
        unavailable<SocialObservation[]>("social", DataState.DATA_UNAVAILABLE, "Social provider is not configured in this build."),
      );
  const newsPromise: Promise<ProviderResult<NewsObservation[]>> = deps.news
    ? deps.news.searchNews(searchQuery, entityTarget, knownTokens)
    : Promise.resolve(unavailable<NewsObservation[]>("news", DataState.DATA_UNAVAILABLE, "News provider is not configured in this build."));

  const [social, news] = await Promise.all([socialPromise, newsPromise]);

  return {
    token,
    capturedAt,
    identity,
    contract: { state: contract.state, data: contract.data, error: contract.error },
    liquidity: { state: liquidity.state, data: liquidity.data, error: liquidity.error },
    holders: { state: holders.state, data: holders.data, error: holders.error },
    social: { state: social.state, data: social.data, error: social.error },
    news: { state: news.state, data: news.data, error: news.error },
  };
}
