import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataState } from "@hoodflow/core";
import { DexScreenerClient } from "../src/dexscreener/client.js";
import { mockFetchOnce } from "./mock-fetch.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf-8"));

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("DexScreenerClient", () => {
  it("picks the highest-liquidity pair and normalizes it", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(200, loadFixture("dexscreener-valid.json")) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data?.liquidityUsd).toBe(96000);
    expect(result.data?.dexId).toBe("uniswap");
    expect(result.data?.marketCapUsd).toBe(3400000);
  });

  it("returns DATA_UNAVAILABLE on 404 (chain/token not indexed)", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(404, {}) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.DATA_UNAVAILABLE);
  });

  it("returns DATA_UNAVAILABLE on an empty pairs array", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(200, []) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.DATA_UNAVAILABLE);
  });

  it("returns INVALID_INPUT for a malformed chain slug", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(200, []) });
    const result = await client.getTokenLiquidity("bad slug!", ADDRESS);
    expect(result.state).toBe(DataState.INVALID_INPUT);
  });

  it("returns RATE_LIMITED on HTTP 429", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(429, {}) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.RATE_LIMITED);
  });
});
