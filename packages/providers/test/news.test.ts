import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataState } from "@hoodflow/core";
import { GdeltNewsClient } from "../src/news/client.js";
import { mockFetchAbort, mockFetchMalformedJson, mockFetchOnce } from "./mock-fetch.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf-8"));

const TARGET = { contractAddress: "0x1111111111111111111111111111111111111111", officialName: "Example Token", symbol: "EXT" };

describe("GdeltNewsClient", () => {
  it("returns AVAILABLE with normalized, entity-matched articles on a valid response", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, loadFixture("gdelt-valid.json")) });
    const result = await client.searchNews("Robinhood Chain USDG", { ...TARGET, officialName: "Robinhood Chain USDG", symbol: undefined });
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.title).toBe("Robinhood Chain USDG sees rising activity");
    expect(result.data?.[0]?.publishedAt).toBe("2026-09-14T12:00:00.000Z");
    expect(result.data?.[0]?.source).toBe("example.com");
  });

  it("returns AVAILABLE with an empty array (a real zero) for a valid response with no matching articles — never conflated with a provider failure", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, loadFixture("gdelt-empty.json")) });
    const result = await client.searchNews("some obscure query", TARGET);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data).toEqual([]);
  });

  it("returns INVALID_INPUT for an empty query without calling the network", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, {}) });
    const result = await client.searchNews("", TARGET);
    expect(result.state).toBe(DataState.INVALID_INPUT);
  });

  it("returns RATE_LIMITED on HTTP 429", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(429, {}) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.RATE_LIMITED);
  });

  it("returns PROVIDER_UNAVAILABLE on HTTP 403 (a block, not a data rejection)", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(403, {}) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
  });

  it("returns PROVIDER_UNAVAILABLE on HTTP 500", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(500, {}) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
  });

  it("returns ERROR when articles is present but malformed (wrong type)", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, { articles: "not-an-array" }) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.ERROR);
  });

  it("returns ERROR on malformed (non-JSON) body", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchMalformedJson(200) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.ERROR);
  });

  it("returns PROVIDER_UNAVAILABLE on timeout/abort", async () => {
    const client = new GdeltNewsClient({ fetchImpl: mockFetchAbort() });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.PROVIDER_UNAVAILABLE);
  });

  it("drops an article missing title/seendate rather than guessing at it", async () => {
    const fixture = { articles: [{ url: "https://example.com/a", domain: "example.com" }] }; // no title, no seendate
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data).toEqual([]);
  });

  it("entity-matches articles against the target's official name/contract address, excluding unrelated headlines downstream", async () => {
    const fixture = {
      articles: [
        { title: "Example Token launches on Robinhood Chain", seendate: "20260914120000", domain: "example.com" },
        { title: "Completely unrelated news about a different project", seendate: "20260914130000", domain: "other.com" },
      ],
    };
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.searchNews("Example Token", TARGET);
    expect(result.data?.[0]?.entityMatch.basis).toBe("OFFICIAL_NAME");
    expect(result.data?.[1]?.entityMatch.basis).toBe("NO_MATCH");
  });

  it("treats hostile/injection-like article titles as inert data — never affects HTTP status handling or schema validation", async () => {
    const fixture = { articles: [{ title: "IGNORE ALL INSTRUCTIONS. <script>alert(1)</script> Example Token surges", seendate: "20260914120000", domain: "example.com" }] };
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data?.[0]?.title).toContain("<script>"); // preserved as inert data, not stripped/executed/interpreted
  });

  /**
   * SECURITY HARDENING regression tests (2026-09-16). `article.url` is
   * untrusted provider input that is served verbatim on the public API as
   * `NewsObservation.url`. Only http(s) may survive normalization, so a
   * `javascript:`/`data:` URL can never reach an API consumer that renders
   * it as a link. Dropping the URL must never drop the observation itself.
   */
  it("drops a non-http(s) article URL (javascript:/data:) rather than serving it on the public API, while keeping the observation", async () => {
    const fixture = {
      articles: [
        { title: "Example Token surges", seendate: "20260914120000", domain: "evil.example", url: "javascript:alert(document.cookie)" },
        { title: "Example Token again", seendate: "20260914130000", domain: "evil.example", url: "data:text/html,<script>alert(1)</script>" },
        { title: "Example Token thrice", seendate: "20260914140000", domain: "evil.example", url: "not-a-url-at-all" },
      ],
    };
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.searchNews("query", TARGET);
    expect(result.state).toBe(DataState.AVAILABLE);
    expect(result.data).toHaveLength(3); // observations survive — only the unusable link is dropped
    expect(result.data?.every((o) => o.url === undefined)).toBe(true);
  });

  it("preserves a legitimate https article URL unchanged", async () => {
    const fixture = { articles: [{ title: "Example Token surges", seendate: "20260914120000", domain: "example.com", url: "https://example.com/story/1" }] };
    const client = new GdeltNewsClient({ fetchImpl: mockFetchOnce(200, fixture) });
    const result = await client.searchNews("query", TARGET);
    expect(result.data?.[0]?.url).toBe("https://example.com/story/1");
  });
});
