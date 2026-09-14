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
 * Chain's slug was confirmed live on 2026-09-14 to be "robinhood" (see
 * docs/LIVE_VERIFICATION.md — a Phase 0 guess of "robinhoodchain" was
 * wrong and would have silently produced empty results forever, since an
 * unrecognized slug and "no pairs yet" are indistinguishable responses).
 * Passing an unrecognized/unsupported slug is expected to surface as
 * DATA_UNAVAILABLE (empty result), not a crash.
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

      if (status === 403) {
        // See docs/LIVE_VERIFICATION.md — observed live from a sandboxed verification run
        // where an upstream network policy, not DexScreener, blocked the request.
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, "DexScreener returned HTTP 403 (blocked, not a data rejection).", status);
      }
      if (status === 404) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "No pairs found for this token on this chain.", status);
      }
      if (status === 429) {
        return unavailable(PROVIDER, DataState.RATE_LIMITED, "DexScreener rate limit exceeded.", status);
      }
      if (status >= 500) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `DexScreener returned HTTP ${status}.`, status);
      }
      if (status >= 400) {
        return unavailable(PROVIDER, DataState.ERROR, `DexScreener returned HTTP ${status}.`, status);
      }

      const parsed = DexScreenerPairsResponseSchema.safeParse(json);
      if (!parsed.success) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `DexScreener response failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          status,
        );
      }

      const pairs = Array.isArray(parsed.data) ? parsed.data : (parsed.data.pairs ?? []);
      const primary = pickPrimaryPair(pairs ?? []);
      if (!primary) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "No liquidity pairs indexed for this token yet.", status);
      }

      return available(PROVIDER, normalizeDexScreenerPair(primary), latencyMs, status);
    } catch (err) {
      if (err instanceof ProviderTimeoutError || err instanceof ProviderHttpError) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      }
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown DexScreener error.");
    }
  }
}
