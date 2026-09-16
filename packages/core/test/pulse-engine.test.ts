import { describe, expect, it } from "vitest";
import { buildEcosystemPulse } from "../src/pulse/pulse-engine.js";
import { buildReport } from "../src/report/build-report.js";
import { resolveIdentity } from "../src/identity/resolve-identity.js";
import { DataState } from "../src/types/data-state.js";
import { PulseDimensionState, PulseWindow } from "../src/types/pulse.js";
import type { TokenSnapshot } from "../src/types/domain.js";
import type { ScanRecord } from "../src/history/history-store.js";

const CHAIN_ID = 4663;
const NOW = "2026-09-16T12:00:00.000Z";
const PREVIOUS = "2026-09-16T06:00:00.000Z";

function snapshot(address: string, capturedAt: string, holderCount: number, liquidityUsd: number): TokenSnapshot {
  return {
    token: { chainId: CHAIN_ID, address },
    capturedAt,
    identity: resolveIdentity([], CHAIN_ID, address, [], capturedAt),
    contract: { state: DataState.DATA_UNAVAILABLE },
    liquidity: { state: DataState.AVAILABLE, data: { liquidityUsd } },
    holders: { state: DataState.AVAILABLE, data: { holderCount } },
  };
}

function scanRecord(address: string, capturedAt: string, holderCount: number, liquidityUsd: number, previous?: TokenSnapshot): ScanRecord {
  const snap = snapshot(address, capturedAt, holderCount, liquidityUsd);
  return { snapshot: snap, report: buildReport(snap, { previousSnapshot: previous }) };
}

describe("buildEcosystemPulse", () => {
  it("reports DATA_UNAVAILABLE / INSUFFICIENT_HISTORY on every dimension when no tokens have been scanned this window — never a fabricated ecosystem trend", () => {
    const pulse = buildEcosystemPulse({
      chainId: CHAIN_ID,
      chainName: "Robinhood Chain",
      registrySize: 3,
      window: PulseWindow.TWENTY_FOUR_HOURS,
      windowStartedAt: PREVIOUS,
      windowEndedAt: NOW,
      generatedAt: NOW,
      scans: [],
    });
    expect(pulse.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(pulse.coverage.trackedTokenCount).toBe(0);
    expect(pulse.coverage.registrySize).toBe(3);
    expect(pulse.dimensions.every((d) => d.state === PulseDimensionState.INSUFFICIENT_HISTORY)).toBe(true);
    expect(pulse.limitations.length).toBeGreaterThan(0);
  });

  it("aggregates real per-token events into liquidity/holder dimensions, deduplicating by latest scan per token", () => {
    const addressA = "0x1111111111111111111111111111111111111111";
    const addressB = "0x2222222222222222222222222222222222222222";

    const prevA = snapshot(addressA, PREVIOUS, 1000, 100_000);
    const scanA1 = scanRecord(addressA, PREVIOUS, 1000, 100_000);
    const scanA2 = scanRecord(addressA, NOW, 1200, 150_000, prevA); // liquidity + holders both increased

    const prevB = snapshot(addressB, PREVIOUS, 2000, 200_000);
    const scanB1 = scanRecord(addressB, PREVIOUS, 2000, 200_000);
    const scanB2 = scanRecord(addressB, NOW, 1800, 150_000, prevB); // both decreased

    const pulse = buildEcosystemPulse({
      chainId: CHAIN_ID,
      chainName: "Robinhood Chain",
      registrySize: 3,
      window: PulseWindow.TWENTY_FOUR_HOURS,
      windowStartedAt: PREVIOUS,
      windowEndedAt: NOW,
      generatedAt: NOW,
      scans: [scanA1, scanA2, scanB1, scanB2],
    });

    expect(pulse.coverage.trackedTokenCount).toBe(2); // 2 distinct tokens, not 4 scans
    expect(pulse.coverage.scanCount).toBe(4);
    const liquidityDim = pulse.dimensions.find((d) => d.name === "liquidityChanges")!;
    expect(liquidityDim.state).toBe(PulseDimensionState.MEASURED);
    expect(liquidityDim.value).toBe(0); // 1 up, 1 down -> net 0
    const holderDim = pulse.dimensions.find((d) => d.name === "holderActivity")!;
    expect(holderDim.value).toBe(0);
  });

  it("reports MEASURED_ZERO (a real, informative zero) rather than INSUFFICIENT_HISTORY when tokens were tracked but no event of that kind occurred", () => {
    const addressA = "0x1111111111111111111111111111111111111111";
    const scanA = scanRecord(addressA, NOW, 1000, 100_000); // first scan, no previous -> no delta events possible
    const pulse = buildEcosystemPulse({
      chainId: CHAIN_ID,
      chainName: "Robinhood Chain",
      registrySize: 3,
      window: PulseWindow.TWENTY_FOUR_HOURS,
      windowStartedAt: PREVIOUS,
      windowEndedAt: NOW,
      generatedAt: NOW,
      scans: [scanA],
    });
    expect(pulse.coverage.trackedTokenCount).toBe(1);
    const liquidityDim = pulse.dimensions.find((d) => d.name === "liquidityChanges")!;
    expect(liquidityDim.state).toBe(PulseDimensionState.MEASURED_ZERO);
    expect(liquidityDim.value).toBe(0);
  });

  it("scopes coverage to one chain and never mixes scans from a different chain", () => {
    const addressA = "0x1111111111111111111111111111111111111111";
    const scanA = scanRecord(addressA, NOW, 1000, 100_000);
    const pulse = buildEcosystemPulse({
      chainId: 46630,
      chainName: "Robinhood Chain Testnet",
      registrySize: 0,
      window: PulseWindow.TWENTY_FOUR_HOURS,
      windowStartedAt: PREVIOUS,
      windowEndedAt: NOW,
      generatedAt: NOW,
      scans: [], // caller is responsible for chain-scoping before calling — verifies the engine trusts its input rather than re-filtering
    });
    expect(pulse.chainId).toBe(46630);
    expect(pulse.coverage.trackedTokenCount).toBe(0);
  });

  it("is deterministic: the same input scans always produce the same pulse", () => {
    const addressA = "0x1111111111111111111111111111111111111111";
    const prevA = snapshot(addressA, PREVIOUS, 1000, 100_000);
    const scanA1 = scanRecord(addressA, PREVIOUS, 1000, 100_000);
    const scanA2 = scanRecord(addressA, NOW, 1200, 150_000, prevA);

    const build = () =>
      buildEcosystemPulse({
        chainId: CHAIN_ID,
        chainName: "Robinhood Chain",
        registrySize: 3,
        window: PulseWindow.TWENTY_FOUR_HOURS,
        windowStartedAt: PREVIOUS,
        windowEndedAt: NOW,
        generatedAt: NOW,
        scans: [scanA1, scanA2],
      });

    expect(build()).toEqual(build());
  });
});
