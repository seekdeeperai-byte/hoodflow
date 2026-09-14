import { DataState, type HolderSummary, type ProviderResult, available, unavailable } from "@hoodflow/core";
import { type FetchLike, ProviderHttpError, ProviderTimeoutError, fetchJson } from "../http.js";
import { isValidEvmAddress, normalizeEvmAddress } from "../validate.js";
import { BlockscoutHoldersResponseSchema, BlockscoutTokenSchema } from "./schema.js";
import { normalizeBlockscoutHolders } from "./normalize.js";

const PROVIDER = "blockscout";

export interface BlockscoutClientOptions {
  /** e.g. "https://robinhoodchain.blockscout.com" — the chain-specific explorer root, no trailing slash. */
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * Blockscout REST API v2 client, scoped to a single chain's explorer
 * instance (Blockscout is deployed per-chain — Robinhood Chain mainnet and
 * testnet each have their own base URL; see docs/DATA_SOURCES.md).
 */
export class BlockscoutClient {
  constructor(private readonly opts: BlockscoutClientOptions) {}

  async getHolderSummary(address: string): Promise<ProviderResult<HolderSummary>> {
    if (!isValidEvmAddress(address)) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "Address is not a well-formed EVM address.");
    }
    const normalized = normalizeEvmAddress(address);
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.opts.apiKey) headers.Authorization = `Bearer ${this.opts.apiKey}`;
    const start = Date.now();

    try {
      const tokenRes = await fetchJson(`${this.opts.baseUrl}/api/v2/tokens/${normalized}`, {
        headers,
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });

      if (tokenRes.status === 403) {
        // Observed live 2026-09-14 against robinhoodchain.blockscout.com from this codebase's
        // verification tooling — looks like bot/WAF protection on the explorer's own domain
        // rather than "this address doesn't exist." See docs/LIVE_VERIFICATION.md. Treated as
        // PROVIDER_UNAVAILABLE (retry-worthy), not DATA_UNAVAILABLE (which would imply we
        // positively confirmed there's no token here).
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, "Blockscout returned HTTP 403 (blocked, not confirmed absent).", tokenRes.status);
      }
      if (tokenRes.status === 404) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "Address is not a recognized token contract on this chain.", tokenRes.status);
      }
      if (tokenRes.status === 429) {
        return unavailable(PROVIDER, DataState.RATE_LIMITED, "Blockscout rate limit exceeded.", tokenRes.status);
      }
      if (tokenRes.status >= 500) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `Blockscout returned HTTP ${tokenRes.status}.`, tokenRes.status);
      }
      if (tokenRes.status >= 400) {
        return unavailable(PROVIDER, DataState.ERROR, `Blockscout returned HTTP ${tokenRes.status}.`, tokenRes.status);
      }

      const tokenParsed = BlockscoutTokenSchema.safeParse(tokenRes.json);
      if (!tokenParsed.success) {
        return unavailable(PROVIDER, DataState.ERROR, "Blockscout token response failed schema validation.", tokenRes.status);
      }

      const holdersRes = await fetchJson(`${this.opts.baseUrl}/api/v2/tokens/${normalized}/holders`, {
        headers,
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });
      const latencyMs = Date.now() - start;

      let holders: { address?: { hash?: string }; value?: string }[] = [];
      if (holdersRes.status === 200) {
        const holdersParsed = BlockscoutHoldersResponseSchema.safeParse(holdersRes.json);
        if (holdersParsed.success) holders = holdersParsed.data.items ?? [];
      }
      // A failed/empty holders page still lets us return the holder *count*
      // from the token endpoint — partial data, not no data.
      const domain = normalizeBlockscoutHolders(tokenParsed.data, holders);
      const state = holders.length > 0 ? DataState.AVAILABLE : DataState.PARTIAL;
      return state === DataState.AVAILABLE
        ? available(PROVIDER, domain, latencyMs, tokenRes.status)
        : {
            state,
            data: domain,
            error: "Holder list unavailable; only aggregate holder count is present.",
            provider: PROVIDER,
            fetchedAt: new Date().toISOString(),
            latencyMs,
            httpStatus: tokenRes.status,
          };
    } catch (err) {
      if (err instanceof ProviderTimeoutError || err instanceof ProviderHttpError) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      }
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown Blockscout error.");
    }
  }
}
