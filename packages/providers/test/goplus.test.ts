import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataState } from "@hoodflow/core";
import { GoPlusClient } from "../src/goplus/client.js";
import { mockFetchAbort, mockFetchMalformedJson, mockFetchOnce } from "./mock-fetch.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf-8"));

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("GoPlusClient", () => {
  it("returns AVAILABLE with normalized data on a valid response", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(200, loadFixture("goplus-valid.json")) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data?.isOpenSource).toBe(true);
    expect(result.data?.buyTaxPct).toBeCloseTo(3);
    expect(result.data?.holderCount).toBe(842);
    expect(result.data?.top10HolderPct).toBeCloseTo(34); // (0.18+0.09+0.07)*100
    expect(result.httpStatus).toBe(200);
    // Phase 5: contextual identity fields, surfaced from token_name/token_symbol for the
    // identity resolver's providerObserved input — never authoritative on their own.
    expect(result.data?.observedName).toBe("Example Token");
    expect(result.data?.observedSymbol).toBe("EXT");
  });

  it("treats an empty-string buy_tax/sell_tax as 0%, matching a real live GoPlus response for chain 4663 (see docs/LIVE_VERIFICATION.md)", async () => {
    const fixture = loadFixture("goplus-valid.json");
    fixture.result[ADDRESS].buy_tax = "";
    fixture.result[ADDRESS].sell_tax = "";
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.data?.buyTaxPct).toBe(0);
    expect(result.data?.sellTaxPct).toBe(0);
  });

  it("returns DATA_UNAVAILABLE when GoPlus has no data for the chain/address", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(200, loadFixture("goplus-empty.json")) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.DATA_UNAVAILABLE);
    expect(result.data).toBeUndefined();
  });

  it("returns INVALID_INPUT for a malformed address without calling the network", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(200, {}) });
    const result = await client.getTokenSecurity(4663, "not-an-address");
    expect(result.state).toBe(DataState.INVALID_INPUT);
  });

  it("returns PROVIDER_UNAVAILABLE (not ERROR) on HTTP 403 — Phase 4 finding, see docs/LIVE_VERIFICATION.md: a live run against this exact client hit a transport-level 403 that was originally misclassified as ERROR", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(403, {}) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
    expect(result.httpStatus).toBe(403);
  });

  it("returns RATE_LIMITED on HTTP 429", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(429, {}) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.RATE_LIMITED);
  });

  it("returns PROVIDER_UNAVAILABLE on HTTP 500", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(500, {}) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
  });

  it("returns ERROR on a response that fails schema validation", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(200, { unexpected: "shape" }) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.ERROR);
  });

  it("returns ERROR on malformed (non-JSON) body", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchMalformedJson(200) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.ERROR);
  });

  it("returns PROVIDER_UNAVAILABLE on timeout/abort", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchAbort() });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
  });

  it("never silently substitutes fabricated data when unavailable", async () => {
    const client = new GoPlusClient({ fetchImpl: mockFetchOnce(500, {}) });
    const result = await client.getTokenSecurity(4663, ADDRESS);
    expect(result.data).toBeUndefined();
  });
});
