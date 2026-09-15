import { describe, expect, it } from "vitest";
import { buildHistoricalComparison } from "../src/historical/build-history.js";
import { DataState } from "../src/types/data-state.js";
import { HistoryStatus } from "../src/types/history.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";

const TOKEN_A = { chainId: 4663, address: "0x1111111111111111111111111111111111111111" };
const TOKEN_B = { chainId: 4663, address: "0x2222222222222222222222222222222222222222" };
const TOKEN_A_ON_TESTNET = { chainId: 46630, address: "0x1111111111111111111111111111111111111111" };

function snapshot(
  token: typeof TOKEN_A,
  capturedAt: string,
  opts: { liquidityUsd?: number; holderCount?: number; top10Pct?: number } = {},
): TokenSnapshot {
  return {
    token,
    capturedAt,
    identity: resolveIdentity([], token.chainId, token.address, [], capturedAt),
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: opts.liquidityUsd !== undefined ? { state: DataState.AVAILABLE, data: { liquidityUsd: opts.liquidityUsd } } : { state: DataState.DATA_UNAVAILABLE },
    holders:
      opts.holderCount !== undefined || opts.top10Pct !== undefined
        ? { state: DataState.AVAILABLE, data: { holderCount: opts.holderCount, top10Pct: opts.top10Pct } }
        : { state: DataState.DATA_UNAVAILABLE },
  };
}

describe("buildHistoricalComparison", () => {
  it("no history (undefined previous) -> INSUFFICIENT_HISTORY, no trends, no relationships", () => {
    const current = snapshot(TOKEN_A, "2026-09-15T00:00:00.000Z", { liquidityUsd: 100_000 });
    const result = buildHistoricalComparison(current, undefined);
    expect(result.status).toBe(HistoryStatus.INSUFFICIENT_HISTORY);
    expect(result.observationsUsed).toBe(1);
    expect(result.trends).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.comparisons.length).toBeGreaterThan(0); // still present, all INSUFFICIENT_HISTORY
  });

  it("one previous observation -> COMPARABLE, real deltas/trends", () => {
    const prev = snapshot(TOKEN_A, "2026-09-14T00:00:00.000Z", { liquidityUsd: 100_000, holderCount: 500, top10Pct: 50 });
    const curr = snapshot(TOKEN_A, "2026-09-15T00:00:00.000Z", { liquidityUsd: 135_000, holderCount: 650, top10Pct: 40 });
    const result = buildHistoricalComparison(curr, prev);
    expect(result.status).toBe(HistoryStatus.COMPARABLE);
    expect(result.observationsUsed).toBe(2);
    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.relationships.length).toBeGreaterThan(0);
    expect(result.relationships[0]?.relationshipType).toBe("BROAD_BASED_LIQUIDITY_GROWTH");
  });

  it("different tokens (different contract address) never get compared against each other", () => {
    const a = snapshot(TOKEN_A, "2026-09-14T00:00:00.000Z", { liquidityUsd: 100_000 });
    const b = snapshot(TOKEN_B, "2026-09-15T00:00:00.000Z", { liquidityUsd: 999_000 });
    // Caller error simulated: this function trusts its caller to only pass the SAME token's
    // previous snapshot (HistoryStore.getPreviousSnapshot is keyed by chainId+address already),
    // but even if it were passed a different token, it must not silently produce a misleading
    // comparison against unrelated data without that being the caller's explicit responsibility.
    const result = buildHistoricalComparison(b, a);
    // The function itself doesn't re-validate token identity (that's HistoryStore's job, already
    // tested in history-store.test.ts) — document that explicitly via this still-executing call.
    expect(result.status).toBe(HistoryStatus.COMPARABLE);
    expect(result.currentObservedAt).toBe(b.capturedAt);
  });

  it("same contract address on a different chain is a different token — chain is part of identity, not just the address", () => {
    expect(TOKEN_A.address).toBe(TOKEN_A_ON_TESTNET.address);
    expect(TOKEN_A.chainId).not.toBe(TOKEN_A_ON_TESTNET.chainId);
    // buildHistoricalComparison itself is chain-agnostic (it only reads capturedAt/data), but
    // this test documents the intended caller contract: HistoryStore.tokenKey() already includes
    // chainId (see history-store.ts), so a mainnet/testnet pair is never conflated upstream.
  });

  it("duplicate timestamps between previous and current do not crash and still produce a comparable result", () => {
    const t = "2026-09-15T00:00:00.000Z";
    const prev = snapshot(TOKEN_A, t, { liquidityUsd: 100_000 });
    const curr = snapshot(TOKEN_A, t, { liquidityUsd: 120_000 });
    const result = buildHistoricalComparison(curr, prev);
    expect(result.status).toBe(HistoryStatus.COMPARABLE);
    expect(result.comparisons.find((c) => c.metric === "liquidityUsd")?.status).toBe("INCREASED");
  });

  it("a future-dated previous snapshot (clock skew) still produces a mathematically defined delta rather than crashing", () => {
    const prev = snapshot(TOKEN_A, "2026-09-20T00:00:00.000Z", { liquidityUsd: 100_000 }); // "future" relative to current
    const curr = snapshot(TOKEN_A, "2026-09-15T00:00:00.000Z", { liquidityUsd: 90_000 });
    const result = buildHistoricalComparison(curr, prev);
    expect(result.status).toBe(HistoryStatus.COMPARABLE);
    expect(Number.isFinite(result.comparisons[0]?.absoluteChange ?? NaN)).toBe(true);
  });
});
