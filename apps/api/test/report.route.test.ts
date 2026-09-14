import { describe, expect, it } from "vitest";
import { DataState, type ProviderResult, type ContractSecurityData, type LiquiditySnapshot, type HolderSummary } from "@hoodflow/core";
import type { BlockscoutClient, DexScreenerClient, GoPlusClient } from "@hoodflow/providers";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function fakeResult<T>(state: DataState, data?: T): ProviderResult<T> {
  return { state, data, provider: "fake", fetchedAt: new Date().toISOString() };
}

function makeDeps(overrides: {
  contract?: ProviderResult<ContractSecurityData>;
  liquidity?: ProviderResult<LiquiditySnapshot>;
  holders?: ProviderResult<HolderSummary>;
}) {
  return {
    goplus: {
      getTokenSecurity: async () => overrides.contract ?? fakeResult(DataState.DATA_UNAVAILABLE),
    } as unknown as GoPlusClient,
    dexscreener: {
      getTokenLiquidity: async () => overrides.liquidity ?? fakeResult(DataState.DATA_UNAVAILABLE),
    } as unknown as DexScreenerClient,
    blockscout: {
      getHolderSummary: async () => overrides.holders ?? fakeResult(DataState.DATA_UNAVAILABLE),
    } as unknown as BlockscoutClient,
  };
}

const ADDRESS = "0x1111111111111111111111111111111111111111";
const config = loadConfig({ ...process.env, RATE_LIMIT_MAX: "1000" });

describe("GET /v1/report/:chainId/:address", () => {
  it("returns 400 for a malformed address", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: "/v1/report/4663/not-an-address" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 for an unregistered chain id", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: `/v1/report/999999/${ADDRESS}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 200 with INSUFFICIENT_DATA market state when every provider is unavailable", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.marketState.state).toBe("INSUFFICIENT_DATA");
    expect(body.social.state).toBe("DATA_UNAVAILABLE");
    await app.close();
  });

  it("returns a populated report when the contract provider succeeds", async () => {
    const app = await buildApp(
      config,
      makeDeps({
        contract: fakeResult(DataState.AVAILABLE, { isMintable: true, isBlacklisted: true }),
        holders: fakeResult(DataState.AVAILABLE, { holderCount: 842, top10Pct: 34 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.marketState.state).toBe("CONTRACT_RISK");
    expect(body.signals.length).toBeGreaterThan(0);
    await app.close();
  });

  it("gates DexScreener liquidity behind a verified chain slug — chain 4663's slug is unverified, so liquidity is DATA_UNAVAILABLE by design even if the provider mock would return data", async () => {
    const app = await buildApp(
      config,
      makeDeps({
        // This mock would satisfy the request if it were ever called — proving the route
        // itself never calls DexScreener for a chain without a verified slug.
        liquidity: fakeResult(DataState.AVAILABLE, { liquidityUsd: 200_000, marketCapUsd: 220_000 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const body = res.json();
    expect(body.dataQuality.liquidity).toBe("DATA_UNAVAILABLE");
    await app.close();
  });

  it("responds to /healthz", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
