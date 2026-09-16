import { DataState, isUsable } from "../types/data-state.js";
import { Confidence } from "../types/intelligence.js";
import { IdentityStatus } from "../types/identity.js";
import type { ScanRecord } from "../history/history-store.js";
import { tokenKey } from "../history/history-store.js";
import { PulseDimensionState, type EcosystemPulse, type PulseDimension, type PulseEventSummary, type PulseWindow } from "../types/pulse.js";

/**
 * Robinhood Ecosystem Pulse aggregation (FINAL GAP CLOSURE phase §6).
 * Deterministic, bounded, chain-aware, reproducible: given the exact same
 * `scans` array, this always produces the exact same `EcosystemPulse` — no
 * hidden state, no randomness, no wall-clock read inside this function
 * (`generatedAt` is passed in). Pure, no I/O — the caller (apps/api) is
 * responsible for pulling `scans` from HistoryStore first.
 */

const MAX_DETAIL_LINES = 10;
const MAX_EXAMPLE_TOKENS = 10;

function latestScanPerToken(scans: ScanRecord[]): ScanRecord[] {
  const byToken = new Map<string, ScanRecord>();
  for (const scan of scans) {
    const key = tokenKey(scan.snapshot.token);
    const existing = byToken.get(key);
    if (!existing || Date.parse(scan.snapshot.capturedAt) > Date.parse(existing.snapshot.capturedAt)) {
      byToken.set(key, scan);
    }
  }
  return [...byToken.values()];
}

function dimension(
  name: string,
  label: string,
  trackedTokenCount: number,
  build: () => { observationCount: number; value?: number; summary: string; details: string[]; confidence: Confidence | null; dataState: DataState },
): PulseDimension {
  if (trackedTokenCount === 0) {
    return {
      name,
      label,
      state: PulseDimensionState.INSUFFICIENT_HISTORY,
      observationCount: 0,
      confidence: null,
      dataState: DataState.DATA_UNAVAILABLE,
      summary: "No tokens on this chain have been scanned within the selected window yet.",
      details: [],
      limitations: ["Insufficient tracked scans to measure this dimension — this is not evidence of ecosystem inactivity, it is simply unmeasured."],
    };
  }
  const result = build();
  return {
    name,
    label,
    state: result.observationCount > 0 ? PulseDimensionState.MEASURED : PulseDimensionState.MEASURED_ZERO,
    observationCount: result.observationCount,
    sourceCoverage: trackedTokenCount > 0 ? result.observationCount / trackedTokenCount : undefined,
    confidence: result.confidence,
    dataState: result.dataState,
    summary: result.summary,
    value: result.value,
    details: result.details.slice(0, MAX_DETAIL_LINES),
    limitations: [],
  };
}

/**
 * Defensive accessor (HOODFLOW MASTERPLUS audit, 2026-09-16): a real, if
 * rare, production condition is a stored `ScanRecord` whose `report` is
 * malformed, from a schema predating some field, or otherwise not a
 * well-formed `HoodflowReport` — e.g. a HistoryStore implementation that
 * doesn't validate on read, or (as this fix was discovered) a locally
 * seeded/imported test record. Pulse aggregates across *every* token this
 * build has scanned; a single bad record must not throw an uncaught
 * exception and 500 the entire chain-level endpoint for every other,
 * perfectly good token. Treating an unreadable record's event contribution
 * as zero is the honest choice here — it's the same "missing != zero"
 * principle applied one level down: zero *events counted from this record*
 * is not the same claim as zero events happened, and this scan's other
 * dimensions (which don't touch `.events`) are unaffected.
 */
function scanEvents(scan: ScanRecord): { eventType: string }[] {
  const events = scan.report?.events?.events;
  return Array.isArray(events) ? events : [];
}

function countEventType(latest: ScanRecord[], eventType: string): { count: number; addresses: string[] } {
  const addresses: string[] = [];
  let count = 0;
  for (const scan of latest) {
    const matches = scanEvents(scan).filter((e) => e.eventType === eventType);
    if (matches.length > 0) {
      count += matches.length;
      addresses.push(scan.snapshot.token.address);
    }
  }
  return { count, addresses };
}

export function buildEcosystemPulse(input: {
  chainId: number;
  chainName: string;
  registrySize: number;
  window: PulseWindow;
  windowStartedAt: string;
  windowEndedAt: string;
  generatedAt: string;
  scans: ScanRecord[];
}): EcosystemPulse {
  const { chainId, chainName, registrySize, window, windowStartedAt, windowEndedAt, generatedAt, scans } = input;
  const latest = latestScanPerToken(scans);
  const trackedTokenCount = latest.length;
  const scanCount = scans.length;
  const limitations: string[] = [];

  if (trackedTokenCount === 0) {
    limitations.push(
      `No tokens on chain ${chainId} have a recorded scan inside this window (${windowStartedAt} to ${windowEndedAt}). HOODFLOW's known-token registry for this chain has ${registrySize} entr${registrySize === 1 ? "y" : "ies"}, but the Pulse only reports on tokens this build has actually scanned — it never extrapolates activity for a token nobody has queried.`,
    );
  }

  const liquidityUp = countEventType(latest, "LIQUIDITY_INCREASE");
  const liquidityDown = countEventType(latest, "LIQUIDITY_DECREASE");
  const liquidityDim = dimension("liquidityChanges", "Observed liquidity changes", trackedTokenCount, () => ({
    observationCount: liquidityUp.count + liquidityDown.count,
    value: liquidityUp.count - liquidityDown.count,
    confidence: liquidityUp.count + liquidityDown.count > 0 ? Confidence.MEDIUM : null,
    dataState: DataState.AVAILABLE,
    summary: `${liquidityUp.count} token(s) recorded a liquidity increase and ${liquidityDown.count} recorded a decrease among ${trackedTokenCount} tracked token(s) this window.`,
    details: [...liquidityUp.addresses.map((a) => `${a}: liquidity increased`), ...liquidityDown.addresses.map((a) => `${a}: liquidity decreased`)],
  }));

  const holderUp = countEventType(latest, "HOLDER_COUNT_INCREASE");
  const holderDown = countEventType(latest, "HOLDER_COUNT_DECREASE");
  const holderDim = dimension("holderActivity", "Observed holder-count changes", trackedTokenCount, () => ({
    observationCount: holderUp.count + holderDown.count,
    value: holderUp.count - holderDown.count,
    confidence: holderUp.count + holderDown.count > 0 ? Confidence.MEDIUM : null,
    dataState: DataState.AVAILABLE,
    summary: `${holderUp.count} token(s) recorded holder-count growth and ${holderDown.count} recorded a decline among ${trackedTokenCount} tracked token(s) this window.`,
    details: [...holderUp.addresses.map((a) => `${a}: holder count increased`), ...holderDown.addresses.map((a) => `${a}: holder count decreased`)],
  }));

  const concUp = countEventType(latest, "HOLDER_CONCENTRATION_INCREASE");
  const concDown = countEventType(latest, "HOLDER_CONCENTRATION_DECREASE");
  const concentrationDim = dimension("concentrationChanges", "Observed holder-concentration changes", trackedTokenCount, () => ({
    observationCount: concUp.count + concDown.count,
    value: concUp.count - concDown.count,
    confidence: concUp.count + concDown.count > 0 ? Confidence.MEDIUM : null,
    dataState: DataState.AVAILABLE,
    summary: `${concUp.count} token(s) recorded increasing top-10 holder concentration and ${concDown.count} recorded decreasing concentration among ${trackedTokenCount} tracked token(s) this window.`,
    details: [...concUp.addresses.map((a) => `${a}: concentration increased`), ...concDown.addresses.map((a) => `${a}: concentration decreased`)],
  }));

  const activity = countEventType(latest, "ACTIVITY_IMBALANCE_OBSERVED");
  const activityDim = dimension("activityChanges", "Observed buy/sell activity imbalances", trackedTokenCount, () => ({
    observationCount: activity.count,
    value: activity.count,
    confidence: activity.count > 0 ? Confidence.LOW : null,
    dataState: DataState.AVAILABLE,
    summary: `${activity.count} token(s) showed a measurable buy/sell activity imbalance among ${trackedTokenCount} tracked token(s) this window.`,
    details: activity.addresses.map((a) => `${a}: buy/sell imbalance observed`),
  }));

  const identityDim = dimension("identityCoverage", "Identity-confirmed vs. unresolved entities", trackedTokenCount, () => {
    // Optional chaining: see scanEvents()'s doc comment above — a malformed/legacy stored
    // record must not crash Pulse for every other token; it simply doesn't count here.
    const confirmed = latest.filter((s) => s.report?.identity?.status === IdentityStatus.CONFIRMED).length;
    const unresolved = trackedTokenCount - confirmed;
    return {
      observationCount: trackedTokenCount,
      value: confirmed,
      confidence: Confidence.HIGH, // identity status is deterministic, not sampled
      dataState: DataState.AVAILABLE,
      summary: `${confirmed} of ${trackedTokenCount} tracked token(s) have confirmed identity; ${unresolved} remain ambiguous, conflicting, or unverified.`,
      details: [],
    };
  });

  const contractRiskDim = dimension("contractRiskDistribution", "Contract-risk market-state distribution", trackedTokenCount, () => {
    const atRisk = latest.filter((s) => s.report?.marketState?.state === "CONTRACT_RISK").length;
    return {
      observationCount: trackedTokenCount,
      value: atRisk,
      confidence: Confidence.MEDIUM,
      dataState: DataState.AVAILABLE,
      summary: `${atRisk} of ${trackedTokenCount} tracked token(s) were classified CONTRACT_RISK on their latest scan this window.`,
      details: [],
    };
  });

  const externalAttentionDim = dimension("externalAttention", "External attention coverage", trackedTokenCount, () => {
    const socialUsable = latest.filter((s) => s.report?.dataQuality && isUsable(s.report.dataQuality.social)).length;
    const newsUsable = latest.filter((s) => s.report?.dataQuality && isUsable(s.report.dataQuality.news)).length;
    return {
      observationCount: socialUsable + newsUsable,
      confidence: socialUsable + newsUsable > 0 ? Confidence.LOW : null,
      dataState: DataState.AVAILABLE,
      summary: `Social data was usable for ${socialUsable} and news data for ${newsUsable} of ${trackedTokenCount} tracked token(s) this window. This is external attention, not on-chain evidence.`,
      details: [],
    };
  });

  const crossSourceConvergence = countEventType(latest, "CROSS_SOURCE_CONVERGENCE_OBSERVED");
  const crossSourceDivergence = countEventType(latest, "CROSS_SOURCE_DIVERGENCE_OBSERVED");
  const crossSourceDim = dimension("crossSourceSignal", "Cross-source convergence / divergence", trackedTokenCount, () => ({
    observationCount: crossSourceConvergence.count + crossSourceDivergence.count,
    value: crossSourceConvergence.count - crossSourceDivergence.count,
    confidence: crossSourceConvergence.count + crossSourceDivergence.count > 0 ? Confidence.MEDIUM : null,
    dataState: DataState.AVAILABLE,
    summary: `${crossSourceConvergence.count} cross-source convergence and ${crossSourceDivergence.count} divergence observation(s) among ${trackedTokenCount} tracked token(s) this window.`,
    details: [],
  }));

  const totalEvents = latest.reduce((sum, s) => sum + scanEvents(s).length, 0);
  const eventTypeCounts = new Map<string, { count: number; addresses: string[] }>();
  for (const scan of latest) {
    for (const event of scanEvents(scan)) {
      const entry = eventTypeCounts.get(event.eventType) ?? { count: 0, addresses: [] };
      entry.count++;
      if (!entry.addresses.includes(scan.snapshot.token.address)) entry.addresses.push(scan.snapshot.token.address);
      eventTypeCounts.set(event.eventType, entry);
    }
  }
  const newEventsDim = dimension("newIntelligenceEvents", "Intelligence events generated this window", trackedTokenCount, () => ({
    observationCount: totalEvents,
    value: totalEvents,
    confidence: totalEvents > 0 ? Confidence.MEDIUM : null,
    dataState: DataState.AVAILABLE,
    summary: `${totalEvents} intelligence event(s) were generated across ${trackedTokenCount} tracked token(s)' latest scans this window.`,
    details: [],
  }));

  const eventSummaries: PulseEventSummary[] = [...eventTypeCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([eventType, v]) => ({ eventType, count: v.count, exampleTokenAddresses: v.addresses.slice(0, MAX_EXAMPLE_TOKENS) }));

  const dataCoverageDim: PulseDimension = {
    name: "dataCoverage",
    label: "Ecosystem data coverage",
    state: trackedTokenCount > 0 ? PulseDimensionState.MEASURED : PulseDimensionState.INSUFFICIENT_HISTORY,
    observationCount: scanCount,
    sourceCoverage: registrySize > 0 ? trackedTokenCount / registrySize : undefined,
    confidence: trackedTokenCount > 0 ? Confidence.HIGH : null,
    dataState: trackedTokenCount > 0 ? DataState.AVAILABLE : DataState.DATA_UNAVAILABLE,
    summary: `${trackedTokenCount} of ${registrySize} registry-known token(s) on ${chainName} had at least one scan this window (${scanCount} scan(s) total). This reflects what HOODFLOW has actually scanned, never a claim of complete chain coverage.`,
    value: trackedTokenCount,
    details: [],
    limitations: [],
  };

  const dimensions = [
    liquidityDim,
    holderDim,
    concentrationDim,
    activityDim,
    identityDim,
    contractRiskDim,
    externalAttentionDim,
    crossSourceDim,
    newEventsDim,
    dataCoverageDim,
  ];

  return {
    chainId,
    chainName,
    generatedAt,
    window,
    windowStartedAt,
    windowEndedAt,
    coverage: { registrySize, trackedTokenCount, scanCount },
    dimensions,
    eventSummaries,
    dataState: trackedTokenCount > 0 ? DataState.AVAILABLE : DataState.DATA_UNAVAILABLE,
    limitations,
  };
}
