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
    // Phase 5: contextual identity fields from baseToken.name/symbol.
    expect(result.data?.observedName).toBe("Example Token");
    expect(result.data?.observedSymbol).toBe("EXT");
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

  it("returns PROVIDER_UNAVAILABLE (not ERROR) on HTTP 403", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(403, {}) });
    const result = await client.getTokenLiquidity("robinhood", ADDRESS);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
    expect(result.httpStatus).toBe(403);
  });

  it("returns RATE_LIMITED on HTTP 429", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(429, {}) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.RATE_LIMITED);
  });

  // Phase 9 audit: every other client (GoPlus) already had a schema-validation-failure
  // test, but this branch of DexScreenerClient — real production code, not test-only —
  // had no coverage of its own. `pairs` present but the wrong type fails the client's
  // `z.union([array, {pairs}])` response schema entirely (unlike a merely-empty/absent
  // `pairs`, which is the already-covered DATA_UNAVAILABLE case above).
  it("returns ERROR on a response that fails schema validation", async () => {
    const client = new DexScreenerClient({ fetchImpl: mockFetchOnce(200, { pairs: "not-an-array" }) });
    const result = await client.getTokenLiquidity("robinhoodchain", ADDRESS);
    expect(result.state).toBe(DataState.ERROR);
    expect(result.data).toBeUndefined();
  });
});
