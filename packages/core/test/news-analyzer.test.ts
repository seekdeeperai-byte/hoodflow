import { describe, expect, it } from "vitest";
import { analyzeNews, groupNewsStories } from "../src/news/news-analyzer.js";
import { DataState } from "../src/types/data-state.js";
import { EntityMatchBasis, SourceQuality, type NewsObservation } from "../src/types/social-news.js";

function article(overrides: Partial<NewsObservation> = {}): NewsObservation {
  return {
    source: "example.com",
    title: "Robinhood Chain token sees rising activity",
    publishedAt: "2026-09-14T12:00:00.000Z",
    entityMatch: { basis: EntityMatchBasis.OFFICIAL_NAME, note: "matched" },
    sourceQuality: SourceQuality.ESTABLISHED_PUBLISHER,
    category: "MARKET_COVERAGE",
    ...overrides,
  };
}

describe("groupNewsStories", () => {
  it("groups near-identical syndicated headlines into one story", () => {
    const observations = [
      article({ source: "outlet-a.com", title: "Robinhood Chain token sees rising activity this week" }),
      article({ source: "outlet-b.com", title: "Robinhood Chain token sees rising activity this week", publishedAt: "2026-09-14T13:00:00.000Z" }),
      article({ source: "outlet-c.com", title: "Robinhood Chain token sees rising activity this week", publishedAt: "2026-09-14T14:00:00.000Z" }),
    ];
    const groups = groupNewsStories(observations);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.memberCount).toBe(3);
    expect(groups[0]?.sources).toEqual(["outlet-a.com", "outlet-b.com", "outlet-c.com"]);
    // Representative is the earliest-published member, not an invented summary.
    expect(groups[0]?.firstPublishedAt).toBe("2026-09-14T12:00:00.000Z");
  });

  it("keeps genuinely distinct stories as separate groups", () => {
    const observations = [
      article({ title: "Robinhood Chain token sees rising activity" }),
      article({ title: "Regulators announce new crypto guidance for stablecoins", source: "reg-news.com" }),
    ];
    const groups = groupNewsStories(observations);
    expect(groups).toHaveLength(2);
  });

  it("never double-counts a single syndicated story as multiple distinct stories", () => {
    const observations = Array.from({ length: 5 }, (_, i) => article({ source: `outlet-${i}.com` }));
    const groups = groupNewsStories(observations);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.memberCount).toBe(5);
  });
});

describe("analyzeNews", () => {
  it("never fabricates data when the provider is unavailable", () => {
    const { summary, signals } = analyzeNews(undefined, DataState.PROVIDER_UNAVAILABLE);
    expect(summary.dataState).toBe(DataState.PROVIDER_UNAVAILABLE);
    expect(summary.storyGroups).toEqual([]);
    expect(signals).toEqual([]);
    expect(summary.limitations[0]).toMatch(/not that no news exists/i);
  });

  it("distinguishes 'no news' (real zero) from 'no news data' (unavailable) in its limitations wording", () => {
    const { summary } = analyzeNews([], DataState.AVAILABLE);
    expect(summary.dataState).toBe(DataState.AVAILABLE);
    expect(summary.articleCount).toBe(0);
    expect(summary.limitations.some((l) => /real zero/i.test(l))).toBe(true);
  });

  it("reports storyCount (deduplicated) distinct from articleCount (raw)", () => {
    const observations = [
      article({ source: "outlet-a.com" }),
      article({ source: "outlet-b.com" }),
      article({ title: "A completely unrelated headline about something else entirely", source: "outlet-c.com" }),
    ];
    const { summary } = analyzeNews(observations, DataState.AVAILABLE);
    expect(summary.articleCount).toBe(3);
    expect(summary.storyCount).toBe(2);
    expect(summary.limitations.some((l) => /more than one outlet/i.test(l))).toBe(true);
  });

  it("emits NEWS_COVERAGE_LEVEL with NEUTRAL direction", () => {
    const { signals } = analyzeNews([article()], DataState.AVAILABLE);
    const signal = signals.find((s) => s.signalType === "NEWS_COVERAGE_LEVEL");
    expect(signal?.direction).toBe("NEUTRAL");
  });

  it("excludes NO_MATCH articles and records why", () => {
    const observations = [article(), article({ entityMatch: { basis: EntityMatchBasis.NO_MATCH, note: "unrelated" }, title: "Something else" })];
    const { summary } = analyzeNews(observations, DataState.AVAILABLE);
    expect(summary.articleCount).toBe(1);
    expect(summary.limitations.some((l) => /did not match this token/i.test(l))).toBe(true);
  });
});
