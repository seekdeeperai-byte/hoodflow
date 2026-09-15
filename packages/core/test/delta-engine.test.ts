import { describe, expect, it } from "vitest";
import { computeComparisons } from "../src/historical/delta-engine.js";
import { DataState } from "../src/types/data-state.js";
import { DeltaStatus } from "../src/types/history.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";

const TOKEN = { chainId: 4663, address: "0x1111111111111111111111111111111111111111" };

function snapshot(
  capturedAt: string,
  overrides: {
    liquidity?: { state: DataState; liquidityUsd?: number };
    holders?: { state: DataState; holderCount?: number; top10Pct?: number; top20Pct?: number };
  } = {},
): TokenSnapshot {
  return {
    token: TOKEN,
    capturedAt,
    identity: resolveIdentity([], TOKEN.chainId, TOKEN.address, [], capturedAt),
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: overrides.liquidity
      ? { state: overrides.liquidity.state, data: overrides.liquidity.liquidityUsd !== undefined ? { liquidityUsd: overrides.liquidity.liquidityUsd } : undefined }
      : { state: DataState.DATA_UNAVAILABLE },
    holders: overrides.holders
      ? {
          state: overrides.holders.state,
          data:
            overrides.holders.holderCount !== undefined || overrides.holders.top10Pct !== undefined || overrides.holders.top20Pct !== undefined
              ? { holderCount: overrides.holders.holderCount, top10Pct: overrides.holders.top10Pct, top20Pct: overrides.holders.top20Pct }
              : undefined,
        }
      : { state: DataState.DATA_UNAVAILABLE },
  };
}

function delta(comparisons: ReturnType<typeof computeComparisons>, metric: string) {
  const d = comparisons.find((c) => c.metric === metric);
  if (!d) throw new Error(`no delta for ${metric}`);
  return d;
}

describe("computeComparisons", () => {
  it("returns INSUFFICIENT_HISTORY for every metric when there is no previous snapshot at all", () => {
    const current = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const comparisons = computeComparisons(current, undefined);
    for (const d of comparisons) {
      expect(d.status).toBe(DeltaStatus.INSUFFICIENT_HISTORY);
      expect(d.previousValue).toBeNull();
      expect(d.absoluteChange).toBeNull();
    }
    // Current value is still shown even with no history to compare against — current vs
    // historical stay clearly distinguished (Phase 6 §23).
    expect(delta(comparisons, "liquidityUsd").currentValue).toBe(100_000);
  });

  it("liquidity increase: absolute + percentage delta computed correctly", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 135_000 } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.INCREASED);
    expect(d.absoluteChange).toBe(35_000);
    expect(d.percentChange).toBeCloseTo(35, 5);
    expect(d.confidence).toBe("MEDIUM");
  });

  it("liquidity decrease", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 200_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 150_000 } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.DECREASED);
    expect(d.percentChange).toBeCloseTo(-25, 5);
  });

  it("liquidity unchanged: a sub-noise-threshold move is UNCHANGED, not a fabricated trend", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_500 } }); // +0.5%
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.UNCHANGED);
  });

  it("holder count increase/decrease", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, holderCount: 500 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, holderCount: 650 } });
    const d = delta(computeComparisons(curr, prev), "holderCount");
    expect(d.status).toBe(DeltaStatus.INCREASED);
    expect(d.absoluteChange).toBe(150);
    expect(d.percentChange).toBeCloseTo(30, 5);
  });

  it("concentration delta uses percentage points, never confused with percent-of-value", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, top10Pct: 40 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, top10Pct: 45 } });
    const d = delta(computeComparisons(curr, prev), "top10Pct");
    expect(d.status).toBe(DeltaStatus.INCREASED);
    expect(d.percentagePointChange).toBe(5); // +5 points, not +12.5%
    expect(d.percentChange).toBeNull();
  });

  it("the canonical worked example: previous liquidity known, current liquidity unavailable -> UNAVAILABLE, never '-100%'", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.PROVIDER_UNAVAILABLE } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.UNAVAILABLE);
    expect(d.absoluteChange).toBeNull();
    expect(d.percentChange).toBeNull();
    expect(d.currentValue).toBeNull();
    expect(d.previousValue).toBe(100_000); // previous value is still preserved, just not comparable
  });

  it("the canonical worked example: previous holder count unavailable, current known -> UNAVAILABLE, never implies '+500' growth", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { holders: { state: DataState.DATA_UNAVAILABLE } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, holderCount: 500 } });
    const d = delta(computeComparisons(curr, prev), "holderCount");
    expect(d.status).toBe(DeltaStatus.UNAVAILABLE);
    expect(d.absoluteChange).toBeNull();
    expect(d.currentValue).toBe(500);
    expect(d.previousValue).toBeNull();
  });

  it("both sides unavailable -> UNAVAILABLE with an explanatory note, not silently dropped", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.DATA_UNAVAILABLE } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.DATA_UNAVAILABLE } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.UNAVAILABLE);
    expect(d.note).toMatch(/both/i);
  });

  it("zero is a valid, real value where legitimate: previous 0 holders -> current 10 holders is a real, comparable increase", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, holderCount: 0 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { holders: { state: DataState.AVAILABLE, holderCount: 10 } });
    const d = delta(computeComparisons(curr, prev), "holderCount");
    expect(d.status).toBe(DeltaStatus.INCREASED);
    expect(d.absoluteChange).toBe(10);
    expect(d.percentChange).toBeNull(); // division by zero — undefined, not fabricated as "infinite%"
    expect(d.note).toMatch(/zero/i);
  });

  it("negative provider-supplied values are rejected as NOT_COMPARABLE rather than silently used", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: -5 } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.NOT_COMPARABLE);
  });

  it("NaN/Infinity provider values are treated as unusable, never propagated into arithmetic", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: Number.POSITIVE_INFINITY } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.status).toBe(DeltaStatus.UNAVAILABLE);
    expect(Number.isFinite(d.absoluteChange ?? 0)).toBe(true);
  });

  it("preserves both timestamps exactly, never inventing one", () => {
    const prev = snapshot("2026-09-14T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 100_000 } });
    const curr = snapshot("2026-09-15T00:00:00.000Z", { liquidity: { state: DataState.AVAILABLE, liquidityUsd: 110_000 } });
    const d = delta(computeComparisons(curr, prev), "liquidityUsd");
    expect(d.previousObservedAt).toBe("2026-09-14T00:00:00.000Z");
    expect(d.currentObservedAt).toBe("2026-09-15T00:00:00.000Z");
  });
});
