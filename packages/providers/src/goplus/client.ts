import { DataState, type ContractSecurityData, type ProviderResult, available, partial, unavailable } from "@hoodflow/core";
import { type FetchLike, ProviderHttpError, ProviderTimeoutError, fetchJson } from "../http.js";
import { isValidEvmAddress, normalizeEvmAddress } from "../validate.js";
import { GoPlusResponseSchema } from "./schema.js";
import { normalizeGoPlus } from "./normalize.js";

const PROVIDER = "goplus";
const BASE_URL = "https://api.gopluslabs.io/api/v1/token_security";

export interface GoPlusClientOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * GoPlus Security — Token Security API client.
 *
 * Chain support is not assumed: GoPlus returns `result: {}` (empty object,
 * `code: 1`) for a chain/address combination it doesn't recognize, which
 * this client reports as DATA_UNAVAILABLE rather than guessing.
 */
export class GoPlusClient {
  constructor(private readonly opts: GoPlusClientOptions = {}) {}

  async getTokenSecurity(chainId: number, address: string): Promise<ProviderResult<ContractSecurityData>> {
    if (!isValidEvmAddress(address)) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "Address is not a well-formed EVM address.");
    }

    const normalized = normalizeEvmAddress(address);
    const url = `${BASE_URL}/${chainId}?contract_addresses=${normalized}`;
    const start = Date.now();

    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (this.opts.apiKey) headers.Authorization = `Bearer ${this.opts.apiKey}`;

      const { status, json } = await fetchJson(url, {
        headers,
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });
      const latencyMs = Date.now() - start;

      if (status === 403) {
        // Observed live 2026-09-14 from this codebase's sandboxed verification run: an
        // upstream network policy blocked the request before it reached GoPlus at all (see
        // docs/LIVE_VERIFICATION.md). A 403 at the transport layer is access-blocked, not
        // "GoPlus rejected this specific address" — treat it as retry-worthy, same as Blockscout.
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, "GoPlus returned HTTP 403 (blocked, not a data rejection).", status);
      }
      if (status === 429) {
        return unavailable(PROVIDER, DataState.RATE_LIMITED, "GoPlus rate limit exceeded.", status);
      }
      if (status >= 500) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `GoPlus returned HTTP ${status}.`, status);
      }
      if (status >= 400) {
        return unavailable(PROVIDER, DataState.ERROR, `GoPlus returned HTTP ${status}.`, status);
      }

      const parsed = GoPlusResponseSchema.safeParse(json);
      if (!parsed.success) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `GoPlus response failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          status,
        );
      }
      if (parsed.data.code !== 1) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `GoPlus returned code ${parsed.data.code}: ${parsed.data.message ?? ""}`.trim(),
          status,
        );
      }

      const result = parsed.data.result?.[normalized];
      if (!result || Object.keys(result).length === 0) {
        return unavailable(PROVIDER, DataState.DATA_UNAVAILABLE, "GoPlus has no security data for this token/chain.", status);
      }

      const domain = normalizeGoPlus(result);
      return available(PROVIDER, domain, latencyMs, status);
    } catch (err) {
      if (err instanceof ProviderTimeoutError) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      }
      if (err instanceof ProviderHttpError) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      }
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown GoPlus error.");
    }
  }
}
