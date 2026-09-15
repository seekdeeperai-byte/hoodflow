import { describe, expect, it } from "vitest";
import {
  formatUsd,
  formatSignedUsd,
  formatPct,
  formatPp,
  formatCount,
  formatSignedCount,
  metricLabel,
  enumToTitle,
  formatRelativeAge,
} from "../lib/format";

describe("formatUsd", () => {
  it("formats millions", () => {
    expect(formatUsd(2_500_000)).toBe("$2.50M");
  });
  it("formats thousands", () => {
    expect(formatUsd(38_000)).toBe("$38.0K");
  });
  it("formats small values without a suffix", () => {
    expect(formatUsd(428)).toBe("$428");
  });
  it("handles negative values", () => {
    expect(formatUsd(-500)).toBe("-$500");
  });
});

describe("formatSignedUsd", () => {
  it("prefixes positive changes with +", () => {
    expect(formatSignedUsd(38_000)).toBe("+$38.0K");
  });
  it("prefixes negative changes with -", () => {
    expect(formatSignedUsd(-38_000)).toBe("-$38.0K");
  });
});

describe("formatPct / formatPp", () => {
  it("signs a positive percent", () => {
    expect(formatPct(9.74)).toBe("+9.7%");
  });
  it("signs a negative percent", () => {
    expect(formatPct(-4.2)).toBe("-4.2%");
  });
  it("formats percentage points distinctly", () => {
    expect(formatPp(3)).toBe("+3.0pp");
  });
});

describe("formatCount / formatSignedCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(2610)).toBe("2,610");
  });
  it("signs positive count changes", () => {
    expect(formatSignedCount(470)).toBe("+470");
  });
  it("signs negative count changes", () => {
    expect(formatSignedCount(-12)).toBe("-12");
  });
});

describe("metricLabel", () => {
  it("maps known metric field names to display labels", () => {
    expect(metricLabel("liquidityUsd")).toBe("Liquidity");
    expect(metricLabel("top10Pct")).toBe("Top 10 Concentration");
  });
  it("falls back to the raw field name for unknown metrics", () => {
    expect(metricLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("enumToTitle", () => {
  it("title-cases a SCREAMING_SNAKE_CASE enum value, capitalizing only the first word", () => {
    expect(enumToTitle("BROAD_BASED_LIQUIDITY_GROWTH")).toBe("Broad based liquidity growth");
    expect(enumToTitle("CONCENTRATED_LIQUIDITY_GROWTH")).toBe("Concentrated liquidity growth");
  });
});

describe("formatRelativeAge", () => {
  it("formats sub-minute ages in seconds", () => {
    expect(formatRelativeAge(45_000)).toBe("45s ago");
  });
  it("formats sub-hour ages in minutes", () => {
    expect(formatRelativeAge(5 * 60_000)).toBe("5m ago");
  });
  it("formats multi-day ages in days", () => {
    expect(formatRelativeAge(3 * 24 * 60 * 60_000)).toBe("3d ago");
  });
  it("returns a safe fallback for invalid input", () => {
    expect(formatRelativeAge(-1)).toBe("unknown age");
    expect(formatRelativeAge(NaN)).toBe("unknown age");
  });
});
