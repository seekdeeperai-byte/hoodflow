import { describe, expect, it } from "vitest";
import { DataState, type ProviderResult } from "@hoodflow/core";
import { XSocialClient, type BlockscoutClient, type DexScreenerClient, type GoPlusClient } from "@hoodflow/providers";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function fakeResult<T>(state: DataState): ProviderResult<T> {
  return { state, provider: "fake", fetchedAt: new Date().toISOString() };
}

function makeDeps(social?: XSocialClient) {
  return {
    goplus: { getTokenSecurity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
    dexscreener: { getTokenLiquidity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as DexScreenerClient,
    blockscout: { getHolderSummary: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as BlockscoutClient,
    blockscoutChainId: 4663,
    social,
    news: undefined,
  };
}

const config = loadConfig({ ...process.env, RATE_LIMIT_MAX: "1000" });

describe("GET /liveness", () => {
  it("always reports alive with no dependency on external state", async () => {
    const app = await buildApp(config, makeDeps());
    const res = await app.inject({ method: "GET", url: "/liveness" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "alive" });
    await app.close();
  });
});

describe("GET /readiness", () => {
  it("reports ready:true and does not fail when no provider credentials are configured", async () => {
    const app = await buildApp(config, makeDeps());
    const res = await app.inject({ method: "GET", url: "/readiness" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ready).toBe(true);
    expect(typeof body.startedAt).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    // Config in this test has no GOPLUS_API_KEY/BLOCKSCOUT_API_KEY/X_BEARER_TOKEN set —
    // readiness must still be true; these are informational, not a pass/fail gate.
    expect(body.providers.goplus).toBe("unauthenticated");
    expect(body.providers.blockscout).toBe("unauthenticated");
    expect(body.providers.dexscreener).toBe("configured");
    expect(body.providers.news).toBe("configured");
    expect(body.providers.social).toBe("not_configured");
    await app.close();
  });

  it("reports social as configured when a real client was constructed with a bearer token", async () => {
    const app = await buildApp(config, makeDeps(new XSocialClient({ bearerToken: "fake-token-for-wiring-check-only" })));
    const res = await app.inject({ method: "GET", url: "/readiness" });
    expect(res.json().providers.social).toBe("configured");
    await app.close();
  });

  // Regression test for a real bug caught during REAL WORLD DEPLOYMENT verification:
  // server.ts always constructs an XSocialClient instance regardless of whether
  // X_BEARER_TOKEN is set (unset just means the client itself returns
  // PROVIDER_UNAVAILABLE on every call, per XSocialClient's own doc comment). An
  // earlier version of buildReadinessReport checked `deps.social` truthiness, which
  // is *always* true given how server.ts wires things — so readiness always claimed
  // "configured" even with no credential at all, misrepresenting real dependency
  // state. This must stay false unless a bearer token was actually supplied.
  it("reports social as not_configured for a real client constructed with no bearer token, even though the client object itself is present", async () => {
    const app = await buildApp(config, makeDeps(new XSocialClient({})));
    const res = await app.inject({ method: "GET", url: "/readiness" });
    expect(res.json().providers.social).toBe("not_configured");
    await app.close();
  });

  it("stays ready:true even under a provider-unavailable-everywhere scenario — readiness never gates on external reachability", async () => {
    const app = await buildApp(config, makeDeps());
    const res = await app.inject({ method: "GET", url: "/readiness" });
    expect(res.json().ready).toBe(true);
    await app.close();
  });
});

describe("GET /healthz (legacy, kept for backward compatibility)", () => {
  it("still responds 200", async () => {
    const app = await buildApp(config, makeDeps());
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
