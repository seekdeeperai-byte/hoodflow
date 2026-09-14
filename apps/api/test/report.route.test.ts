import { describe, expect, it } from "vitest";
import {
  DataState,
  InMemoryHistoryStore,
  type ProviderResult,
  type ContractSecurityData,
  type LiquiditySnapshot,
  type HolderSummary,
} from "@hoodflow/core";
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

  it("calls DexScreener for chain 4663 now that its slug is verified (Phase 4 — see docs/LIVE_VERIFICATION.md)", async () => {
    const app = await buildApp(
      config,
      makeDeps({
        liquidity: fakeResult(DataState.AVAILABLE, { liquidityUsd: 200_000, marketCapUsd: 220_000, buys24h: 340, sells24h: 110 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const body = res.json();
    expect(body.dataQuality.liquidity).toBe("AVAILABLE");
    await app.close();
  });

  it("still gates DexScreener liquidity behind a verified chain slug for chains where the slug is unverified (e.g. testnet 46630)", async () => {
    const app = await buildApp(
      config,
      makeDeps({
        // This mock would satisfy the request if it were ever called — proving the route
        // itself never calls DexScreener for a chain without a verified slug.
        liquidity: fakeResult(DataState.AVAILABLE, { liquidityUsd: 200_000, marketCapUsd: 220_000 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/46630/${ADDRESS}` });
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

  it("never presents a partial-data report as complete: strong liquidity + missing contract/holders still shows limitations and a non-null confidence penalty", async () => {
    const app = await buildApp(
      config,
      makeDeps({
        liquidity: fakeResult(DataState.AVAILABLE, { liquidityUsd: 500_000, marketCapUsd: 520_000, buys24h: 400, sells24h: 100 }),
        contract: fakeResult(DataState.PROVIDER_UNAVAILABLE),
        holders: fakeResult(DataState.PROVIDER_UNAVAILABLE),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const body = res.json();
    expect(body.dataQuality.contract).toBe("PROVIDER_UNAVAILABLE");
    expect(body.dataQuality.holders).toBe("PROVIDER_UNAVAILABLE");
    expect(body.dataQuality.overallConfidencePenalty).not.toBeNull();
    expect(body.limitations.length).toBeGreaterThan(0);
    // The market state must not become an artificially confident, fully-informed-looking state
    // just because one of three domains had strong data.
    expect(body.score.dataQualityScore).toBeLessThan(100);
  });

  it("propagates RATE_LIMITED from a provider through to the report's dataQuality rather than masking it as DATA_UNAVAILABLE", async () => {
    const app = await buildApp(config, makeDeps({ contract: fakeResult(DataState.RATE_LIMITED) }));
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const body = res.json();
    expect(body.dataQuality.contract).toBe("RATE_LIMITED");
  });

  it("HOLDER_GROWTH appears on a second scan of the same token (via a shared HistoryStore) but not on the first", async () => {
    let holderCount = 1000;
    const deps = {
      goplus: { getTokenSecurity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
      dexscreener: { getTokenLiquidity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as DexScreenerClient,
      blockscout: {
        getHolderSummary: async () => fakeResult(DataState.AVAILABLE, { holderCount, top10Pct: 30 }),
      } as unknown as BlockscoutClient,
    };
    const historyStore = new InMemoryHistoryStore();
    const app = await buildApp(config, deps, historyStore);

    const first = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const firstBody = first.json();
    expect(firstBody.signals.some((s: { signalType: string }) => s.signalType === "HOLDER_GROWTH")).toBe(false);
    expect(firstBody.limitations.join(" ")).toMatch(/no prior snapshot/i);

    holderCount = 1300; // +30% — should trigger a HIGH-strength HOLDER_GROWTH signal
    const second = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const secondBody = second.json();
    const growth = secondBody.signals.find((s: { signalType: string }) => s.signalType === "HOLDER_GROWTH");
    expect(growth).toBeDefined();
    expect(growth.direction).toBe("POSITIVE");
    expect(growth.strength).toBe("HIGH");

    await app.close();
  });
});
