import { describe, expect, it } from "vitest";
import { InMemoryHistoryStore } from "../src/history/in-memory-history-store.js";
import { DataState } from "../src/types/data-state.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import type { HoodflowReport } from "../src/types/intelligence.js";
import { buildReport } from "../src/report/build-report.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";

const TOKEN = { chainId: 4663, address: "0x1111111111111111111111111111111111111111" };

function snapshotAt(capturedAt: string, holderCount: number): TokenSnapshot {
  return {
    token: TOKEN,
    capturedAt,
    identity: resolveIdentity([], TOKEN.chainId, TOKEN.address, [], capturedAt),
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: { state: DataState.DATA_UNAVAILABLE },
    holders: { state: DataState.AVAILABLE, data: { holderCount } },
  };
}

describe("InMemoryHistoryStore", () => {
  it("returns undefined when there is no previous scan for a token", async () => {
    const store = new InMemoryHistoryStore();
    const prev = await store.getPreviousSnapshot(TOKEN, new Date().toISOString());
    expect(prev).toBeUndefined();
  });

  it("returns the most recent scan strictly before the given time", async () => {
    const store = new InMemoryHistoryStore();
    const s1 = snapshotAt("2026-09-14T10:00:00.000Z", 1000);
    const s2 = snapshotAt("2026-09-14T11:00:00.000Z", 1100);
    const r1 = buildReport(s1);
    const r2 = buildReport(s2);
    await store.recordScan({ snapshot: s1, report: r1 });
    await store.recordScan({ snapshot: s2, report: r2 });

    const prev = await store.getPreviousSnapshot(TOKEN, "2026-09-14T12:00:00.000Z");
    expect(prev?.snapshot.capturedAt).toBe("2026-09-14T11:00:00.000Z");

    const midway = await store.getPreviousSnapshot(TOKEN, "2026-09-14T10:30:00.000Z");
    expect(midway?.snapshot.capturedAt).toBe("2026-09-14T10:00:00.000Z");
  });

  it("keeps different tokens' histories separate", async () => {
    const store = new InMemoryHistoryStore();
    const otherToken = { chainId: 4663, address: "0x2222222222222222222222222222222222222222" };
    const s1 = snapshotAt("2026-09-14T10:00:00.000Z", 1000);
    await store.recordScan({ snapshot: s1, report: buildReport(s1) });

    const prevForOther = await store.getPreviousSnapshot(otherToken, "2026-09-14T12:00:00.000Z");
    expect(prevForOther).toBeUndefined();
  });

  it("bounds per-token memory growth by dropping the oldest scans past the cap", async () => {
    const store = new InMemoryHistoryStore();
    for (let i = 0; i < 1005; i++) {
      const s = snapshotAt(new Date(Date.parse("2026-09-14T00:00:00.000Z") + i * 1000).toISOString(), 1000 + i);
      await store.recordScan({ snapshot: s, report: buildReport(s) });
    }
    const since = await store.getScansSince(TOKEN, "2026-01-01T00:00:00.000Z");
    expect(since.length).toBe(1000); // capped, oldest 5 dropped
    expect(since[0]?.snapshot.holders.data?.holderCount).toBe(1005); // the 6th inserted (index 5) is now oldest
  });

  it("getScansSince returns scans oldest-first at or after the given time", async () => {
    const store = new InMemoryHistoryStore();
    const s1 = snapshotAt("2026-09-14T10:00:00.000Z", 1000);
    const s2 = snapshotAt("2026-09-14T11:00:00.000Z", 1100);
    const s3 = snapshotAt("2026-09-14T12:00:00.000Z", 1200);
    for (const s of [s2, s1, s3]) {
      await store.recordScan({ snapshot: s, report: buildReport(s) satisfies HoodflowReport });
    }
    const since = await store.getScansSince(TOKEN, "2026-09-14T11:00:00.000Z");
    expect(since.map((s) => s.snapshot.capturedAt)).toEqual(["2026-09-14T11:00:00.000Z", "2026-09-14T12:00:00.000Z"]);
  });
});
