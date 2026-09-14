import { describe, expect, it } from "vitest";
import { assessFreshness, Freshness } from "../src/freshness.js";

describe("assessFreshness", () => {
  it("is CURRENT when observed and served at the same instant", () => {
    const t = "2026-09-14T10:00:00.000Z";
    expect(assessFreshness(t, t).status).toBe(Freshness.CURRENT);
  });

  it("is STALE once age exceeds the max age", () => {
    const observed = "2026-09-14T10:00:00.000Z";
    const served = "2026-09-14T10:10:00.000Z"; // 10 minutes later
    const result = assessFreshness(observed, served, 5 * 60 * 1000);
    expect(result.status).toBe(Freshness.STALE);
    expect(result.ageMs).toBe(10 * 60 * 1000);
  });

  it("is UNKNOWN for unparseable timestamps rather than throwing", () => {
    const result = assessFreshness("not-a-date", "also-not-a-date");
    expect(result.status).toBe(Freshness.UNKNOWN);
    expect(Number.isNaN(result.ageMs)).toBe(true);
  });

  it("never reports negative age (served-before-observed clock skew clamps to 0)", () => {
    const observed = "2026-09-14T10:10:00.000Z";
    const served = "2026-09-14T10:00:00.000Z";
    const result = assessFreshness(observed, served);
    expect(result.ageMs).toBe(0);
    expect(result.status).toBe(Freshness.CURRENT);
  });
});
