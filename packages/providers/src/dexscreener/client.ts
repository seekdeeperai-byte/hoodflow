import { DataState, type LiquiditySnapshot, type ProviderResult, available, unavailable } from "@hoodflow/core";
import { type FetchLike, ProviderHttpError, ProviderTimeoutError, fetchJson } from "../http.js";
import { isValidEvmAddress, normalizeEvmAddress } from "../validate.js";
import { DexScreenerPairsResponseSchema } from "./schema.js";
import { normalizeDexScreenerPair, pickPrimaryPair } from "./normalize.js";

const PROVIDER = "dexscreener";
const BASE_URL = "https://api.dexscreener.com/token-pairs/v1";

export interface DexScreenerClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * DexScreener token-pairs client. `chainSlug` is DexScreener's own chain
 * identifier (e.g. "ethereum", "base") — NOT a numeric chain id. Robinhood
 * Chain's DexScreener slug is unverified as of 2026-09-14 (see
 * docs/ARCHITECTURE.md §1); passing an unrecognized/unsupported slug is
 * expected to surface as DATA_UNAVAILABLE (empty result), not a crash.
 */
export class DexScreenerClient {
  constructor(private readonly opts: DexScreenerClientOptions = {}) {}

  async getTokenLiquidity(chainSlug: string, address: string): Promise<ProviderResult<LiquiditySnapshot>> {
    if (!isValidEvmAddress(address)) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "Address is not a well-formed EVM address.");
    }
    if (!/^[a-z0-9-]{1,40}$/.test(chainSlug)) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "Chain slug is not well-formed.");
    }

    const normalized = normalizeEvmAddress(address);
    const url = `${BASE_URL}/${chainSlug}/${normalized}`;
    const start = Date.now();

    try {
      const { status, json } = await fetchJson(url, {
        headers: { accept: "application/json" },
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });
      const latencyMs = Date.now() - start;

      if (status === 404) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "No pairs found for this token on this chain.");
      }
      if (status === 429) {
        return unavailable(PROVIDER, DataState.RATE_LIMITED, "DexScreener rate limit exceeded.");
      }
      if (status >= 500) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `DexScreener returned HTTP ${status}.`);
      }
      if (status >= 400) {
        return unavailable(PROVIDER, DataState.ERROR, `DexScreener returned HTTP ${status}.`);
      }

      const parsed = DexScreenerPairsResponseSchema.safeParse(json);
      if (!parsed.success) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `DexScreener response failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        );
      }

      const pairs = Array.isArray(parsed.data) ? parsed.data : (parsed.data.pairs ?? []);
      const primary = pickPrimaryPair(pairs ?? []);
      if (!primary) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "No liquidity pairs indexed for this token yet.");
      }

      return available(PROVIDER, normalizeDexScreenerPair(primary), latencyMs);
    } catch (err) {
      if (err instanceof ProviderTimeoutError || err instanceof ProviderHttpError) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      }
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown DexScreener error.");
    }
  }
}
