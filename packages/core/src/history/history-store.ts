import type { TokenIdentity, TokenSnapshot } from "../types/domain.js";
import type { HoodflowReport } from "../types/intelligence.js";

export interface ScanRecord {
  snapshot: TokenSnapshot;
  report: HoodflowReport;
}

/**
 * Historical persistence, minimal by design — see docs/HISTORY_SCHEMA.md.
 * The only questions this needs to answer today: "what was the previous
 * observation for this token?" and "what observations exist since time X?"
 * `apps/api/src/server.ts` is the single place a concrete implementation
 * is constructed — swapping `InMemoryHistoryStore` for a Postgres-backed
 * one is a one-file change everywhere else in the codebase.
 */
export interface HistoryStore {
  recordScan(entry: ScanRecord): Promise<void>;
  /** Most recent scan strictly before `before` (ISO timestamp), if any. */
  getPreviousSnapshot(token: TokenIdentity, before: string): Promise<ScanRecord | undefined>;
  /** All scans at or after `since` (ISO timestamp), oldest first. */
  getScansSince(token: TokenIdentity, since: string): Promise<ScanRecord[]>;
  /**
   * All scans for every token on `chainId`, at or after `since` (ISO
   * timestamp), oldest first — added for Robinhood Ecosystem Pulse
   * (FINAL GAP CLOSURE phase §6). This is the one place a HistoryStore
   * implementation is asked to enumerate across tokens rather than answer
   * "what happened for this one token" — see docs/ROBINHOOD_ECOSYSTEM_PULSE.md
   * for why the Pulse deliberately reuses this store rather than a second,
   * parallel aggregation store.
   */
  getAllScansSince(chainId: number, since: string): Promise<ScanRecord[]>;
}

export function tokenKey(token: TokenIdentity): string {
  return `${token.chainId}:${token.address.toLowerCase()}`;
}
