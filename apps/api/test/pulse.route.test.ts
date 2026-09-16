import { describe, expect, it } from "vitest";
import { DataState, InMemoryHistoryStore, type ContractSecurityData, type LiquiditySnapshot, type ProviderResult } from "@hoodflow/core";
import type { BlockscoutClient, DexScreenerClient, GoPlusClient } from "@hoodflow/providers";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function fakeResult<T>(state: DataState, data?: T): ProviderResult<T> {
  return { state, data, provider: "fake", fetchedAt: new Date().toISOString() };
}

function makeDeps(overrides: { contract?: ProviderResult<ContractSecurityData>; liquidity?: ProviderResult<LiquiditySnapshot> }) {
  return {
    goplus: { getTokenSecurity: async () => overrides.contract ?? fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
    dexscreener: { getTokenLiquidity: async () => overrides.liquidity ?? fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as DexScreenerClient,
    blockscout: { getHolderSummary: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as BlockscoutClient,
    blockscoutChainId: 4663,
  };
}

const ADDRESS = "0x1111111111111111111111111111111111111111";
const config = loadConfig({ ...process.env, RATE_LIMIT_MAX: "1000" });

describe("GET /v1/pulse/:chainId", () => {
  it("returns 400 for a malformed chainId", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: "/v1/pulse/not-a-number" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for an unrecognized window value", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: "/v1/pulse/4663?window=3weeks" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 for an unregistered chain id", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: "/v1/pulse/999999" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns DATA_UNAVAILABLE with zero tracked tokens when nothing has been scanned yet — never a fabricated ecosystem trend", async () => {
    const app = await buildApp(config, makeDeps({}), new InMemoryHistoryStore());
    const res = await app.inject({ method: "GET", url: "/v1/pulse/4663" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dataState).toBe("DATA_UNAVAILABLE");
    expect(body.coverage.trackedTokenCount).toBe(0);
    expect(body.coverage.registrySize).toBeGreaterThan(0); // the known-token registry is non-empty even with zero live scans
    expect(body.dimensions.every((d: { state: string }) => d.state === "INSUFFICIENT_HISTORY")).toBe(true);
    await app.close();
  });

  it("real end-to-end: a report scan through /v1/report is reflected in a subsequent /v1/pulse call on the same history store", async () => {
    const historyStore = new InMemoryHistoryStore();
    const app = await buildApp(
      config,
      makeDeps({
        contract: fakeResult(DataState.AVAILABLE, { holderCount: 100 }),
        liquidity: fakeResult(DataState.AVAILABLE, { liquidityUsd: 100_000 }),
      }),
      historyStore,
    );

    const reportRes = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    expect(reportRes.statusCode).toBe(200);

    const pulseRes = await app.inject({ method: "GET", url: "/v1/pulse/4663" });
    expect(pulseRes.statusCode).toBe(200);
    const pulse = pulseRes.json();
    expect(pulse.dataState).toBe("AVAILABLE");
    expect(pulse.coverage.trackedTokenCount).toBe(1);
    expect(pulse.coverage.scanCount).toBe(1);

    await app.close();
  });

  it("does not mix scans from a different chain into this chain's pulse", async () => {
    const historyStore = new InMemoryHistoryStore();
    const app = await buildApp(
      config,
      makeDeps({ contract: fakeResult(DataState.AVAILABLE, { holderCount: 100 }) }),
      historyStore,
    );
    await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });

    const testnetPulse = await app.inject({ method: "GET", url: "/v1/pulse/46630" });
    expect(testnetPulse.statusCode).toBe(200);
    expect(testnetPulse.json().coverage.trackedTokenCount).toBe(0);

    await app.close();
  });
});
