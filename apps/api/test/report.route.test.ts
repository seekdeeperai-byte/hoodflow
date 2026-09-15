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

  it("Phase 5: identity CONFIRMED with OFFICIAL_IDENTITY_MATCH for the real, official-docs USDG address, and token.name/symbol are populated from the registry match", async () => {
    const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();
    const app = await buildApp(
      config,
      makeDeps({
        contract: fakeResult(DataState.AVAILABLE, { observedName: "Global Dollar", observedSymbol: "USDG", holderCount: 341809 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${USDG}` });
    const body = res.json();
    expect(body.identity.status).toBe("CONFIRMED");
    expect(body.identity.match.source).toBe("official_docs");
    expect(body.token.name).toBe("Global Dollar");
    expect(body.token.symbol).toBe("USDG");
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "OFFICIAL_IDENTITY_MATCH")).toBe(true);
    // Identity must never influence the score or market state (Phase 5 §5).
    expect(body.score.dataQualityScore).toBe(Math.round((1 / 3) * 100));
    await app.close();
  });

  it("Phase 5: identity CONFIRMED (live_confirmed_third_party) for the real registry GME address — the real Phase 4 naming-collision case study reaching the live route", async () => {
    const GME = "0x7e86381A763F0Ecca2bDF27C54eAC403ddD48123".toLowerCase();
    const app = await buildApp(
      config,
      makeDeps({
        liquidity: fakeResult(DataState.AVAILABLE, { observedName: "GameStop on Robinhood Chain", observedSymbol: "GME", liquidityUsd: 178_000 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${GME}` });
    const body = res.json();
    expect(body.identity.status).toBe("CONFIRMED");
    expect(body.identity.match.source).toBe("live_confirmed_third_party");
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "IDENTITY_CONFIRMED")).toBe(true);
    // Production registry currently has exactly one other GME-named entry: none (the
    // memecoin's real address is unverified — see docs/IDENTITY_RESOLUTION.md), so no
    // collision fires yet for THIS specific address. Confirms the resolver's collision
    // path requires real, verified registry entries — it does not invent one.
    expect(body.identity.conflicts).toHaveLength(0);
    await app.close();
  });

  it("Phase 5: an unknown address whose provider-observed symbol matches the real registry's GME entry surfaces IDENTITY_MISMATCH — never presented as official", async () => {
    const impostor = "0x999999999999999999999999999999999999999e"; // not in the registry
    const app = await buildApp(
      config,
      makeDeps({
        liquidity: fakeResult(DataState.AVAILABLE, { observedName: "GameStop on Robinhood Chain", observedSymbol: "GME", liquidityUsd: 500 }),
      }),
    );
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${impostor}` });
    const body = res.json();
    expect(body.identity.status).toBe("CONFLICTING");
    expect(body.identity.match).toBeNull();
    expect(body.token.name).toBeUndefined(); // never populated from an unconfirmed match
    expect(body.token.symbol).toBeUndefined();
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "IDENTITY_MISMATCH")).toBe(true);
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "OFFICIAL_IDENTITY_MATCH")).toBe(false);
    const mismatch = body.signals.find((s: { signalType: string }) => s.signalType === "IDENTITY_MISMATCH");
    expect((mismatch.evidence as string).toLowerCase()).not.toMatch(/\bscam\b|\bfake\b|\bfraud\b/);
    await app.close();
  });

  it("Phase 5: an address with no registry match and no provider context returns IDENTITY_UNVERIFIED and never crashes the report", async () => {
    const app = await buildApp(config, makeDeps({}));
    const res = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.identity.status).toBe("UNVERIFIED");
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "IDENTITY_UNVERIFIED")).toBe(true);
    await app.close();
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

  it("Phase 6: first scan reports history.status INSUFFICIENT_HISTORY; second scan exposes real comparisons/trends/relationships through the report/API", async () => {
    let liquidityUsd = 100_000;
    let holderCount = 500;
    let top10Pct = 55;
    const deps = {
      goplus: { getTokenSecurity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
      dexscreener: {
        getTokenLiquidity: async () => fakeResult(DataState.AVAILABLE, { liquidityUsd }),
      } as unknown as DexScreenerClient,
      blockscout: {
        getHolderSummary: async () => fakeResult(DataState.AVAILABLE, { holderCount, top10Pct }),
      } as unknown as BlockscoutClient,
    };
    const historyStore = new InMemoryHistoryStore();
    const app = await buildApp(config, deps, historyStore);

    const first = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const firstBody = first.json();
    expect(firstBody.history.status).toBe("INSUFFICIENT_HISTORY");
    expect(firstBody.history.observationsUsed).toBe(1);
    expect(firstBody.history.relationships).toEqual([]);
    expect(firstBody.limitations.join(" ")).toMatch(/historical comparison is unavailable/i);

    // Liquidity + holders up, concentration down -> the canonical broad-based-growth case.
    liquidityUsd = 200_000; // +100%
    holderCount = 750; // +50%
    top10Pct = 35; // -20pp

    const second = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const secondBody = second.json();
    expect(secondBody.history.status).toBe("COMPARABLE");
    expect(secondBody.history.observationsUsed).toBe(2);

    const liquidityDelta = secondBody.history.comparisons.find((c: { metric: string }) => c.metric === "liquidityUsd");
    expect(liquidityDelta.status).toBe("INCREASED");
    expect(liquidityDelta.previousValue).toBe(100_000);
    expect(liquidityDelta.currentValue).toBe(200_000);
    expect(liquidityDelta.percentChange).toBeCloseTo(100, 5);

    const concentrationDelta = secondBody.history.comparisons.find((c: { metric: string }) => c.metric === "top10Pct");
    expect(concentrationDelta.percentagePointChange).toBeCloseTo(-20, 5);
    expect(concentrationDelta.percentChange).toBeNull();

    expect(secondBody.history.relationships.some((r: { relationshipType: string }) => r.relationshipType === "BROAD_BASED_LIQUIDITY_GROWTH")).toBe(true);
    expect(secondBody.signals.some((s: { signalType: string }) => s.signalType === "LIQUIDITY_GROWTH")).toBe(true);
    expect(secondBody.signals.some((s: { signalType: string }) => s.signalType === "HOLDER_CONCENTRATION_DECREASE")).toBe(true);

    // Historical intelligence must never move the deterministic market pipeline.
    expect(secondBody.score.dataQualityScore).toBe(firstBody.score.dataQualityScore);

    await app.close();
  });

  it("Phase 6: a provider going from AVAILABLE to unavailable between scans reports history status UNAVAILABLE for that metric, never a fabricated '-100%' delta", async () => {
    let liquidityState = DataState.AVAILABLE;
    const deps = {
      goplus: { getTokenSecurity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
      dexscreener: {
        getTokenLiquidity: async () => (liquidityState === DataState.AVAILABLE ? fakeResult(DataState.AVAILABLE, { liquidityUsd: 100_000 }) : fakeResult(DataState.PROVIDER_UNAVAILABLE)),
      } as unknown as DexScreenerClient,
      blockscout: { getHolderSummary: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as BlockscoutClient,
    };
    const historyStore = new InMemoryHistoryStore();
    const app = await buildApp(config, deps, historyStore);

    await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    liquidityState = DataState.PROVIDER_UNAVAILABLE;
    const second = await app.inject({ method: "GET", url: `/v1/report/4663/${ADDRESS}` });
    const body = second.json();

    const liquidityDelta = body.history.comparisons.find((c: { metric: string }) => c.metric === "liquidityUsd");
    expect(liquidityDelta.status).toBe("UNAVAILABLE");
    expect(liquidityDelta.percentChange).toBeNull();
    expect(liquidityDelta.currentValue).toBeNull();
    expect(liquidityDelta.previousValue).toBe(100_000);
    expect(body.signals.some((s: { signalType: string }) => s.signalType === "LIQUIDITY_DECLINE")).toBe(false);

    await app.close();
  });
});
