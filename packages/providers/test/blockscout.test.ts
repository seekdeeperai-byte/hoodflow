import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataState } from "@hoodflow/core";
import { BlockscoutClient } from "../src/blockscout/client.js";
import { mockFetchOnce, mockFetchSequence } from "./mock-fetch.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf-8"));

const ADDRESS = "0x1111111111111111111111111111111111111111";
const BASE_URL = "https://robinhoodchain.blockscout.com";

describe("BlockscoutClient", () => {
  it("returns AVAILABLE with holder summary when both calls succeed", async () => {
    const client = new BlockscoutClient({
      baseUrl: BASE_URL,
      fetchImpl: mockFetchSequence([
        { status: 200, body: loadFixture("blockscout-token.json") },
        { status: 200, body: loadFixture("blockscout-holders.json") },
      ]),
    });
    const result = await client.getHolderSummary(ADDRESS);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data?.holderCount).toBe(842);
    expect(result.data?.top10Pct).toBeCloseTo(34); // (180000+90000+70000)/1000000 * 100
    // Phase 5: contextual identity fields from the token endpoint's name/symbol.
    expect(result.data?.observedName).toBe("Example Token");
    expect(result.data?.observedSymbol).toBe("EXT");
  });

  it("normalizes a null name/symbol (Blockscout's own nullable contract) to undefined, never an empty string or null placeholder", async () => {
    const tokenFixture = { ...loadFixture("blockscout-token.json"), name: null, symbol: null };
    const client = new BlockscoutClient({
      baseUrl: BASE_URL,
      fetchImpl: mockFetchSequence([
        { status: 200, body: tokenFixture },
        { status: 200, body: loadFixture("blockscout-holders.json") },
      ]),
    });
    const result = await client.getHolderSummary(ADDRESS);
    expect(result.data?.observedName).toBeUndefined();
    expect(result.data?.observedSymbol).toBeUndefined();
  });

  it("returns PARTIAL when the holders page fails but token metadata succeeds", async () => {
    const client = new BlockscoutClient({
      baseUrl: BASE_URL,
      fetchImpl: mockFetchSequence([
        { status: 200, body: loadFixture("blockscout-token.json") },
        { status: 500, body: {} },
      ]),
    });
    const result = await client.getHolderSummary(ADDRESS);
    expect(result.state).toBe(DataState.PARTIAL);
    expect(result.data?.holderCount).toBe(842);
    expect(result.data?.top10Pct).toBeUndefined();
  });

  it("returns DATA_UNAVAILABLE on 404 (not a recognized token)", async () => {
    const client = new BlockscoutClient({ baseUrl: BASE_URL, fetchImpl: mockFetchOnce(404, {}) });
    const result = await client.getHolderSummary(ADDRESS);
    expect(result.state).toBe(DataState.DATA_UNAVAILABLE);
  });

  it("returns PROVIDER_UNAVAILABLE (not DATA_UNAVAILABLE) on HTTP 403 — a block is not confirmation the token doesn't exist", async () => {
    const client = new BlockscoutClient({ baseUrl: BASE_URL, fetchImpl: mockFetchOnce(403, {}) });
    const result = await client.getHolderSummary(ADDRESS);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
    expect(result.httpStatus).toBe(403);
  });

  it("returns INVALID_INPUT for a malformed address", async () => {
    const client = new BlockscoutClient({ baseUrl: BASE_URL, fetchImpl: mockFetchOnce(200, {}) });
    const result = await client.getHolderSummary("nope");
    expect(result.state).toBe(DataState.INVALID_INPUT);
  });
});
