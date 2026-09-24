import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataState, type ProviderResult } from "@hoodflow/core";
import type { BlockscoutClient, DexScreenerClient, GoPlusClient } from "@hoodflow/providers";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fakeResult<T>(state: DataState): ProviderResult<T> {
  return { state, provider: "fake", fetchedAt: new Date().toISOString() };
}

function makeDeps() {
  return {
    goplus: { getTokenSecurity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as GoPlusClient,
    dexscreener: { getTokenLiquidity: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as DexScreenerClient,
    blockscout: { getHolderSummary: async () => fakeResult(DataState.DATA_UNAVAILABLE) } as unknown as BlockscoutClient,
    blockscoutChainId: 4663,
    social: undefined,
    news: undefined,
  };
}

/**
 * A deployment-shaped env: nothing here reaches a network or a database, but
 * it is the exact shape the Vercel project sets.
 */
const baseEnv = { PORT: "8787", HOST: "0.0.0.0", RATE_LIMIT_MAX: "1000" };

describe("TRUST_PROXY", () => {
  it("defaults to false so a direct-facing deploy never trusts a client-supplied X-Forwarded-For", () => {
    expect(loadConfig({ ...baseEnv }).TRUST_PROXY).toBe(false);
  });

  it("is a strict boolean — a typo fails startup rather than silently disabling the control", () => {
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY: "1" })).toThrow(/TRUST_PROXY/);
  });

  /**
   * The behaviour this flag exists for. Behind a proxy, every request arrives
   * from the same socket address, so without it the per-IP rate limiter
   * collapses into one bucket shared by every user of the deployment — the
   * defect this asserts against is "user A's traffic 429s user B".
   */
  it("off: two different forwarded clients are billed to the same rate-limit bucket", async () => {
    const app = await buildApp(loadConfig({ ...baseEnv, RATE_LIMIT_MAX: "2", TRUST_PROXY: "false" }), makeDeps());
    const a = await app.inject({ method: "GET", url: "/v1/pulse/4663", headers: { "x-forwarded-for": "203.0.113.1" } });
    const b = await app.inject({ method: "GET", url: "/v1/pulse/4663", headers: { "x-forwarded-for": "198.51.100.2" } });
    // Same bucket: the second (different) client sees the budget already spent.
    expect(Number(b.headers["x-ratelimit-remaining"])).toBeLessThan(Number(a.headers["x-ratelimit-remaining"]));
    await app.close();
  });

  it("on: each forwarded client gets its own rate-limit bucket", async () => {
    const app = await buildApp(loadConfig({ ...baseEnv, RATE_LIMIT_MAX: "2", TRUST_PROXY: "true" }), makeDeps());
    const a = await app.inject({ method: "GET", url: "/v1/pulse/4663", headers: { "x-forwarded-for": "203.0.113.1" } });
    const b = await app.inject({ method: "GET", url: "/v1/pulse/4663", headers: { "x-forwarded-for": "198.51.100.2" } });
    expect(a.headers["x-ratelimit-remaining"]).toBe(b.headers["x-ratelimit-remaining"]);
    await app.close();
  });
});

describe("PG_POOL_MAX", () => {
  it("defaults to a long-running-process size and is overridable for serverless", () => {
    expect(loadConfig({ ...baseEnv }).PG_POOL_MAX).toBe(10);
    expect(loadConfig({ ...baseEnv, PG_POOL_MAX: "1" }).PG_POOL_MAX).toBe(1);
  });

  it("rejects a nonsensical value instead of falling back to a default that hides the misconfiguration", () => {
    expect(() => loadConfig({ ...baseEnv, PG_POOL_MAX: "0" })).toThrow(/PG_POOL_MAX/);
  });
});

/**
 * The Vercel function entry is the one file in this package that
 * `tsconfig.json` does not cover (it imports build output, which does not
 * exist at typecheck time). These assertions are what stands in for that:
 * they fail the build if the shim stops pointing at a real, still-existing
 * export, which is otherwise only discoverable by deploying.
 */
describe("Vercel function entry point", () => {
  const shim = readFileSync(join(apiRoot, "api", "index.ts"), "utf8");

  it("re-exports the compiled adapter rather than duplicating its logic", () => {
    expect(shim).toContain('export { default } from "../dist/vercel-handler.js"');
    // Guard against logic creeping back into the untype-checked file.
    const code = shim
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("//"))
      .join("\n");
    expect(code.split("\n")).toHaveLength(1);
  });

  it("resolves to a callable handler once the package is built", async () => {
    const mod = await import("../src/vercel-handler.js");
    expect(typeof mod.default).toBe("function");
    // (req, res)
    expect(mod.default.length).toBe(2);
  });

  it("is routed to from every path by vercel.json, and its function config exists", () => {
    const vercelJson = JSON.parse(readFileSync(join(apiRoot, "vercel.json"), "utf8")) as {
      functions: Record<string, unknown>;
      rewrites: { source: string; destination: string }[];
      outputDirectory: string;
    };
    expect(Object.keys(vercelJson.functions)).toContain("api/index.ts");
    expect(vercelJson.rewrites).toContainEqual({ source: "/(.*)", destination: "/api/index" });
    // Declared output directory must actually exist, or the build fails with
    // "No Output Directory found" after a successful compile.
    expect(() => readFileSync(join(apiRoot, vercelJson.outputDirectory, "index.html"))).not.toThrow();
  });
});
